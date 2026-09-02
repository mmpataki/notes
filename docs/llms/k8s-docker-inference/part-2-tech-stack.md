title: part 2 - tech stack
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


## kind

- creates cluster nodes in the docker as containers.
- you can create multi node cluster
- cluster is also configuration driven

### sample cluster config in kind

note we are mapping host `/dev/nvidia0` into container, this works in real Linux machines but not in the WSL because there is no real `/dev/nvidia0` in WSL.

WSL uses `/dev/dxg` for graphics apps

```
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4

nodes:
- role: control-plane
- role: worker
- role: worker
  extraMounts:
    - hostPath: /dev/nvidia0
      containerPath: /dev/nvidia0
- role: worker
```


##### Starting the cluster
```
$ kind create cluster --config kind-config.yml
Creating cluster "kind" ...
 ✓ Ensuring node image (kindest/node:v1.36.1) 🖼
 ✓ Preparing nodes 📦 📦 📦 📦
 ✓ Writing configuration 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
 ✓ Joining worker nodes 🚜
Set kubectl context to "kind-kind"
You can now use your cluster with:

kubectl cluster-info --context kind-kind

Have a nice day! 👋
```

## Container backend

- Docker + containerd



# Deployment idea

- Setup a 3 node kind cluster
- Run 2 replicas of llama.cpp
- Run Prometheus scrapers for all of them
- Visualize the metrics in Grafana
