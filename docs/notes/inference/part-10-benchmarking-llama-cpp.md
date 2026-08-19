title: part 10 - benchmarking llama-cpp
date: 15-aug-2026
tags: #llama-cpp #benchmarking #public


All setup was done and chat UI was up, but what!!! For a 360M model the decoding rate is 0.78tok/s

![[Pasted image 20260809112000.png]]


For the same model-laptop pair, I had seen 100+ tok/s decoding speed!

![[Pasted image 20260809112216.png]]


I was really puzzled and my mind ran behind things like fast math library / AVX etc. I even went and put perf on both containers.

## perf and WSL

There is no perf support available in WSL. Even if you install it, you'll get

```
$ perf
WARNING: perf not found for kernel 6.6.87.2-microsoft

  You may need to install the following packages for this specific kernel:
    linux-tools-6.6.87.2-microsoft-standard-WSL2
    linux-cloud-tools-6.6.87.2-microsoft-standard-WSL2

  You may also want to install one of the following packages to keep up to date:
    linux-tools-standard-WSL2
    linux-cloud-tools-standard-WSL2
```


But there is a hack. You can install

```
$ sudo apt install linux-tools-generic
```


Then you can use 

```
$ sudo /usr/lib/linux-tools/*/perf stat
...
^C
 Performance counter stats for 'system wide':

          53762.86 msec cpu-clock                        #   27.997 CPUs utilized
             38593      context-switches                 #  717.838 /sec
               601      cpu-migrations                   #   11.179 /sec
               926      page-faults                      #   17.224 /sec
   <not supported>      cycles
   <not supported>      instructions
   <not supported>      branches
   <not supported>      branch-misses

       1.920326551 seconds time elapsed
```


But then, you won't get all stats as you get on a bare-metal Linux box.


### perf in containers?

Although we can install linux-tools package on containers (or add it to the image), you can simply have it on the node, login to node and instrument all the container processes directly.

So if I list llama processes on my WSL, I will get

```
$ ps -ef | grep llama
root     60275 59928  0 07:41 ?        00:00:09 /app/bin/llama-server --metrics --port 8080 --host 0.0.0.0 ...
root     60291 59929  0 07:41 ?        00:00:09 /app/bin/llama-server --metrics --port 8080 --host 0.0.0.0 ...
root     60360 59941  0 07:41 ?        00:00:11 /app/bin/llama-server --metrics --port 8080 --host 0.0.0.0 ...
mmp      65592 91769  0 09:11 pts/4    00:00:00 grep --color=auto llama
```

And I can instrument these processes

```
$ sudo /usr/lib/linux-tools-6.8.0-137/perf record -agp 60275
$ sudo /usr/lib/linux-tools-6.8.0-137/perf stat -p 60275
```


I started a `llama-server` on my WSL and compared the stats of both the instances.


##### Container

```
 Performance counter stats for process id '60360':

          32441.40 msec task-clock                       #    0.875 CPUs utilized
              6810      context-switches                 #  209.917 /sec
               181      cpu-migrations                   #    5.579 /sec
                26      page-faults                      #    0.801 /sec
   <not supported>      cycles
   <not supported>      instructions
   <not supported>      branches
   <not supported>      branch-misses

      37.089214344 seconds time elapsed
```


##### WSL

```
 Performance counter stats for process id '67371':

           4016.16 msec task-clock                       #    0.870 CPUs utilized
               600      context-switches                 #  149.397 /sec
                33      cpu-migrations                   #    8.217 /sec
               883      page-faults                      #  219.862 /sec
   <not supported>      cycles
   <not supported>      instructions
   <not supported>      branches
   <not supported>      branch-misses

       4.615463401 seconds time elapsed
```


Note the high number of context switches and time elapsed. They are 10x apart. So Linux scheduler is swapping our process off the CPU very often. But why?

To understand this, I was looking for some metric which will tell me the amount of time my RUNNABLE container threads were running on CPU but I found the metric.

**container_cpu_cfs_throttled_periods_total**: amount of time the container's CPU usage was throttled. Luckily, Google's `cAdvisor` scrapes these metrics.

![[Pasted image 20260816115547.png]]


I wondered whether this was due to the number of CPU cores I set for the pod in the deployment descriptor. So I played around that value (1-16) and the TPS increased significantly.

But still this was not a good progression because I implemented GPT-2 inference and the TPS was ~2 with similar model size. So I wanted to know whether this is in par with what we can do with `llama-cpp` option `-t 1` which basically sets the number of threads to 1.

So I ran the `llama-cpp` with `-t 1` on the WSL (not in k8s). To my surprise the TPS was in range ~30.

Now I wanted to know how much this native WSL process was stalled. To do this, I should've scrapped the metrics from `/proc` or installed `process-exporter` but then I didn't have much patience for this and asked `claude` to set this up for me (I gave the comparison context as well).

### Claude understood the assignment

`claude` setup the exact environment for me using `systemd-run` and my TPS came down in the same <1 range. This was the command it used

```
systemd-run --user --scope -p CPUQuota=100% ./bin/llama-server -m /path/to/model ...
```

Notice the `CPUQuota` set to `100%`. This makes the CPU scheduler throttle the application.


### A bit of a note on CFS, Quota

Best read on CFS - https://blogs.oracle.com/linux/cfs-group-scheduling

CFS (Completely Fair Scheduler) in Linux tries to be fairest to all tasks. But to incorporate priorities it uses `vruntime` (virtual runtime) instead of real wall clock time. Here is how it works

- the tasks in Linux are organized as a tree of schedulable entities per CPU
- scheduler is triggered on these reasons
	- timer tick
	- when a task goes to sleep, blocked for io
	- when a task wakes up, io completes etc.
- on every tick, it updates the current task's vruntime, checks the run_q of its CPU and picks the task with lowest `vruntime`
- each schedulable entity has two properties (can be found in - `/sys/fs/cgroup/<cgroup-name>/cpu.max`).
	- schedule interval - each task has a quota and when a task runs this much time, quota resets
	- quota - amount of CPU time which can be consumed from schedule interval.
- together these properties control the real parallelism
	- if quota > schedule interval the sched entity can use multiple cores, so if quota = 200ms and sched interval = 100ms, with 2 cores and many other tasks competing, this will be allowed to use 2 cores for 100ms and its limit will be reset after 100ms. if it uses 4 cores, it will exhaust the quota and will be throttled after 50ms and has to wait 50ms more to get new quota in its new sched interval.
	
	- if quota < schedule interval task gets throttled within the schedule interval. so if quota = 50ms and sched interval = 100ms, 1 cpu and there are no other tasks to compete
		- a task will run for 50ms and just wait until its 100ms interval finishes
	
	- if quota = max, it will be allowed to use as much *left out* cpu resources possible

##### vruntime

this is from a clock (a virtual one) which runs slow for priority tasks and fast for non-priority ones. CFS always picks the task with smallest `vruntime` and schedules it. After the schedule interval `vruntime` is updated as follows

```
vruntime += actual-cpu-time * (nice_0_weight / tasks_nice_weight)
```

The value for nice weights are hardcoded in kernel source code. For eg. nice_0_weight = 1024.



### Back to our problem

So the setup done by Claude was using quota=100% so parallel work that can be done in a scheduling interval was limited to one thread's worth of work.

If this was the case, llama process with `-t 1` shouldn't have TPS ~ 30. So I tried putting `-t 1` with quota=100% and suddenly the TPS jumped to ~30.

#### What happened here?

To find out, I tried varying the number of threads and here are the results. The number of threads are varied from 1, 2, 3, 4.

![[Pasted image 20260816113825.png]]


With `-t 1` llama-cpp runs just one thread for inference, otherwise it was running 14 threads. When 14 threads run in parallel these concerns appear

- L1, L2 cache eviction : these are core-private caches and inference is a memory bound operation. Evictions here will hit the performance
- TLB flushes
- Scheduling overheads -- #TODO: how to measure this?
- Overhead due to CPU load-balancing movements


##### Other interesting graphs
In all the below graphs, number of threads are varied as 1, 2, 3, 4


Pre-fill is a compute bound operation: 

![[Pasted image 20260816113836.png]]

throttling period counts

![[Pasted image 20260816113546.png]]


what is this? - periods in which sched entity was on CPU?

![[Pasted image 20260816113610.png]]
