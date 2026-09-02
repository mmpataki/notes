title: part 2.a - tech stack - minikube
date: 06-Aug-2026
tags: #docker #k8s #public


# machine - WSL

we need Linux flavor!

# k8s

this is an awesome configuration driven, pluggable system. Most of the stuff here is pluggable. Like 

- container management system
- network subsystem
- storage system
- ...

There are some implementations of Kubernetes like `kind` , `podman` etc. Choosing `kind` as I want to do a test setup in a laptop


## minikube

- creates cluster nodes in the docker as containers.
- you can create multi node cluster
- GPU support


### install, start

```
$ curl -LO https://github.com/kubernetes/minikube/releases/latest/download/minikube-linux-amd64
$ sudo install minikube-linux-amd64 /usr/local/bin/minikube && rm minikube-linux-amd64
$ minikube start --driver docker --container-runtime docker --gpus all --nodes 3
😄  minikube v1.38.1 on Ubuntu 24.04
✨  Using the docker driver based on user configuration
❗  Starting v1.39.0, minikube will default to "containerd" container runtime. See #21973 for more info.
📌  Using Docker driver with root privileges
👍  Starting "minikube" primary control-plane node in "minikube" cluster
🚜  Pulling base image v0.0.50 ...
🔥  Creating docker container (CPUs=2, Memory=3072MB) ...
🐳  Preparing Kubernetes v1.35.1 on Docker 29.2.1 ...
🔗  Configuring CNI (Container Networking Interface) ...
🔎  Verifying Kubernetes components...
    ▪ Using image nvcr.io/nvidia/k8s-device-plugin:v0.18.2
    ▪ Using image gcr.io/k8s-minikube/storage-provisioner:v5
🌟  Enabled addons: nvidia-device-plugin, storage-provisioner, default-storageclass

👍  Starting "minikube-m02" worker node in "minikube" cluster
🚜  Pulling base image v0.0.50 ...
🔥  Creating docker container (CPUs=2, Memory=3072MB) ...
🌐  Found network options:
    ▪ NO_PROXY=192.168.49.2
🐳  Preparing Kubernetes v1.35.1 on Docker 29.2.1 ...
    ▪ env NO_PROXY=192.168.49.2
🔎  Verifying Kubernetes components...

👍  Starting "minikube-m03" worker node in "minikube" cluster
🚜  Pulling base image v0.0.50 ...
🔥  Creating docker container (CPUs=2, Memory=3072MB) ...
🌐  Found network options:
    ▪ NO_PROXY=192.168.49.2,192.168.49.3
🐳  Preparing Kubernetes v1.35.1 on Docker 29.2.1 ...
    ▪ env NO_PROXY=192.168.49.2
    ▪ env NO_PROXY=192.168.49.2,192.168.49.3
🔎  Verifying Kubernetes components...

❗  /usr/bin/kubectl is version 1.33.7, which may have incompatibilities with Kubernetes 1.35.1.
    ▪ Want kubectl v1.35.1? Try 'minikube kubectl -- get pods -A'
🏄  Done! kubectl is now configured to use "minikube" cluster and "default" namespace by default

```


### inbuilt dashboard
```
minikube dashboard
```

## Container backend

- Docker + containerd



# Deployment idea

- Setup a 3 node kind cluster
- Run 2 replicas of llama.cpp
- Run Prometheus scrapers for all of them
- Visualize the metrics in Grafana
