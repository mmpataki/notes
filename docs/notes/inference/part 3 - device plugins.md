date: 06-aug-2026
tags: #k8s  #public


## Device discovery

For situations when there are many nodes in cluster with different types of h/w, and a workload requires a particular type of h/w (like GPU, SSE), k8s provides a simple way to handle this

#### Device plugins
These are daemon sets which run on all or some nodes of the cluster, periodically scans the h/w and report the device and the resource quantity to the control plane

For GPUs, we have `nvidia-device-plugin-daemonset`

To select where the daemon set runs, k8s operator labels the nodes and uses `nodeSelector` on the daemonset config to schedule them on those nodes

##### Getting nodes
```
$ kubectl get nodes
NAME                 STATUS   ROLES           AGE   VERSION
kind-control-plane   Ready    control-plane   25h   v1.36.1
kind-worker          Ready    <none>          25h   v1.36.1
kind-worker2         Ready    <none>          25h   v1.36.1
kind-worker3         Ready    <none>          25h   v1.36.1
```

##### Labelling nodes
```
kubectl label nodes kind-worker2 mpataki_gpu=1
```

##### deploying nvidia-plugin

Since we are planning to run the daemon set on only two nodes, we will need a custom config with node labels - `nvidia-gpu-ds.yml`

```
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nvidia-device-plugin-daemonset
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: nvidia-device-plugin-ds
  template:
    metadata:
      labels:
        name: nvidia-device-plugin-ds
    spec:
      tolerations:
      - key: nvidia.com/gpu
        operator: Exists
        effect: NoSchedule
      nodeSelector:
        mpataki_gpu: "1"       # <<<<--------------- note this
      priorityClassName: "system-node-critical"
      containers:
      - image: nvcr.io/nvidia/k8s-device-plugin:v0.17.1
        name: nvidia-device-plugin-ctr
        env:
          - name: FAIL_ON_INIT_ERROR
            value: "false"
        volumeMounts:
        - name: device-plugin
          mountPath: /var/lib/kubelet/device-plugins
      volumes:
      - name: device-plugin
        hostPath:
          path: /var/lib/kubelet/device-plugins
```


#### deploying

```
kubectl apply -f nvidia-gpu-ds.yml
```


## the problem

it was not that simple, the daemon was unable to detect the GPUs. This was because the docker container need to have devices registered in to it. The namespace needs to have the /dev/nvidia0 mounted ig.

the error was 
```
I0806 05:29:20.195459       1 main.go:356] Retrieving plugins.
E0806 05:29:20.195544       1 factory.go:112] Incompatible strategy detected auto
E0806 05:29:20.195558       1 factory.go:113] If this is a GPU node, did you configure the NVIDIA Container Toolkit?
E0806 05:29:20.195561       1 factory.go:114] You can check the prerequisites at: https://github.com/NVIDIA/k8s-device-plugin#prerequisites
E0806 05:29:20.195563       1 factory.go:115] You can learn how to set the runtime at: https://github.com/NVIDIA/k8s-device-plugin#quick-start
E0806 05:29:20.195566       1 factory.go:116] If this is not a GPU node, you should set up a toleration or nodeSelector to only deploy this plugin on GPU nodes
I0806 05:29:20.195569       1 main.go:381] No devices found. Waiting indefinitely.
```

For this I installed the nvidia-ctk (link in above logs) but that didn't help at all. Because WSL doesn't mount the `/dev/nvidia0` but uses `/dev/dxg`


## Giving up on GPUs

tags: #todo #public

Since there is very limited that I can do here, I left it (I know I can contribute something to WSL / docker to get the GPU on docker, but its' not the time now)