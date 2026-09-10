title: Chapter 1 - Introduction to CUDA
tags: #public 
date: 30 may 2026

G80 

- had a 8GBps communication bandwidth with CPU which means parallely you can read & write 4GB/s to and from/to GPU to CPU (system memory).

- Inside the GPU, the memory bandwidth was 86.4 GBps


If you look at the ratio of the data transfers it might seem like GPU will starve most of the time. Beucase it's 10x faster. But in reality (earlier era like 2006) the CPU->FSB->Memory link was itself slow and comparable to PCI Express link (which is used in CPU to GPU)

And the work on GPU is not like 
CPU->GPU
GPU->CPU
CPU->GPU

But instead
CPU->GPU
GPU computes
Only results copied back to CPU

So the ratio of work to communication matters, It's known as

Arithmetic Intensity =        FLOPS
						-------------------
						 Transferred bytes

G80 had
- 128 SPs
- 16 SMs with 8 SPs
- they claim above 500 GFLOPs
- Special function unit for SQRT
- Other transcendental functions (which can't be expressed as +-x/ or roots)
	- trig, exp, inv. trig, hyperbolic
- supports max 768 threads per SM
- so 12288 threads per chip

G200
- 240 SPs
- 1 TFLOP
- 1024 threads per SM
- ~30000 threads
- ~30 SMs
- 8 SP per SM


Other approaches before CUDA
- MPI - Message Passing Interface
	- was massively scalable - 100000 node clusters
	- lacking shared memory
- OpenMP
	- Scalability was limited - 100 node clusters
	- High thread management overhead
	- Requires cache coherency
- OpenCL - NVIDIA, Apple, Intel, AMD





NVIDIA | Cuda programming guide

![[Pasted image 20260530154738.png|650]]


Computation model

Grid
- Cluster  // available in compute capability 9 and above
	- Thread block
		- Warp   // 32 threads, used while physical scheduling
			- Thread


All threads in a thread block are run on a single SM and they can synchronize among themselves.
There is no synchronization available between threads in different thread blocks
Threads in a block share common memory called shared memory

![[Pasted image 20260530162056.png|251]]

With chips with compute capability 9 and above, we get Clusters
All Thread blocks in Clusters are scheduled on same Graphics Processing Cluster but can be on different SMs.
Threads in different thread blocks of a Cluster can synchronize using Cooperative groups and can access each other's memory named as Distributed shared memory

![[Pasted image 20260530162032.png|253]]


The warp and SIMT
The threads within a thread block are grouped in to a set of 32 (each is called a warp lane) and are executed in a SIMT (Single Instruction Multiple Thread) model. All threads are supposed to execute the same instruction but are allowed to take different branch. This is done through masking, whenever a thread takes a different path, that thread is masked until instruction related to its branch are seen

![[Pasted image 20260530164007.png|346]]

This is called thread divergence and is useful to understand for writing performant code. It's also implied that thread blocks with thread count as a multiple of 32 is preferred.



# Memory

1. GPU memory - GDDR
	- Attached to GPU, HBM
2. Unified memory
	- Shared accross CPU and GPU, access thru PCIE or NVLINK etc.
3. On chip memory
	- L2 cache, L1 cache
4. Unified cache
	- Used to created shared memory and register file
	- Size of the register file and shared memory is configurable during runtime
