date: 06-aug-2026
tags: #llama-cpp #docker  #public


# llama.cpp

I decided to give up on `sglang` as it requires GPU and switched to llama.cpp (CPU build). I started with building the container image myself. I had a local build in a directory named `build-cpu` so I just wrapped it

##### DockerFile

```
FROM ubuntu:24.04
RUN apt-get update && \
    apt-get install -y libgomp1 && \
    rm -rf /var/lib/apt/lists/*
COPY build-cpu /app
RUN mkdir -p /etc/ssl/certs
WORKDIR /app
CMD ["/app/bin/llama-server", "--metrics", "--port", "8080", "--host", "0.0.0.0", "-m", "/models/SmolLM2-360M-Instruct-Q4_K_M.gguf"]
EXPOSE 8080
```

###### Some other issues I faced

Initially I thought I will get the model from the hugging face. So used `-hf <model-name>` but that failed because the base ubuntu image above was missing ca-certs. I tried installing them using the `sudo apt install -y ca-certificates` and `update-ca-certificates` but this image didn't have repos.

So I thought I will download the models myself, put them on the local file-system and mount those volumes on these containers


## Deployment plan

- Wrap the llama.cpp build in a docker
- Install the docker image in kind cluster
- Create a deployment


## Dockerizing the llama.cpp

##### building the image
```
$ docker build -t llama-cpp:latest .
```

##### loading in to the kind
```
kind load docker-image llama-cpp:latest
```


## Deploying in to k8s

I created a deployment descriptor with the container and tried applying it on the cluster and post that I faced many many many issues. Here are some important ones


### 1. Mounting the `build-cpu` dir directly on the container from WSL

I didn't want to copy the `build-cpu` dir from the WSL to container. So I thought I will just mount it using container volumes, but it didn't work because, the mount volume must be present in the node (k8s node) and not in the WSL machine

This is because the kind node docker container (container which represents the k8s node) is running another container mgmt process inside it and it's the one who is creating new containers.

That's why, we don't see our other dockers when I do `docker ps` in WSL.

```
$ docker ps
CONTAINER ID   IMAGE                 STATUS        PORTS                       NAMES
1171bc6424cf   kindest/node:v1.36.1  Up 30 hours   127.0.0.1:35607->6443/tcp   kind-control-plane
fdf98f379379   kindest/node:v1.36.1  Up 30 hours                               kind-worker3
527904b6d1dc   kindest/node:v1.36.1  Up 30 hours                               kind-worker
001704e32356   kindest/node:v1.36.1  Up 30 hours                               kind-worker2
```


### 2. Trying the HF models

This didn't work, so I had to go for the models present in the local dir. There were two options again
- Mount the WSL directory with models in kind node and then mount these on containers
- Persistent volume

I went for PVs! For this, we need to copy the model GGUF files onto the PV. Since I already deployed my llama-cpp app, this is what I followed

- Create a PV, PVC
- Create a dummy deployment with command "sleep 3600" and let it claim the PVC
- Copy the GGUF file from WSL to this PV using
```
$ kubectl cp model.gguf dummy-pod:/models/
```
- delete the dummy deployment
```
$ kubectl delete deployment dummy
```
- Mount the volume for the llama-cpp deployment and delete the pod (so a new one comes up!)
```
- name: models
  persistentVolumeClaim:
	claimName: models-dynamic-pvc
```



#### 3. Unable to mount the PVC on a node

I have 3 nodes and the PV was bound to a node1. The llama.cpp got scheduled on node2 (because it had some nodeAffinity with which I was experimenting). k8s was not mounting the PV on node2 because the accessModes was set to RWO. Since it was mounted on a node1, it was not being moved. This was the error

```
0/4 nodes are available: 1 node(s) didn't match PersistentVolume's node affinity, 1 node(s) had untolerated taint(s), 2 node(s) didn't match Pod's node affinity/selector. no new claims to deallocate, preemption: 0/4 nodes are available: 4 Preemption is not helpful for scheduling.
```


### And finally llama-cpp pod was up!


## Ingress for llama-cpp

llama-cpp pod was up and now I wanted to access it from outside, so we need to setup the n/wing for it. I went for nginx based ingress(-controller) and loadbalancer

## definitions

### Service

```
apiVersion: v1
kind: Service
metadata:
  name: llama-cpp-service
  labels:
    app: my-llama-app
spec:
  selector:
    name: my-llama-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
```


### Ingress

Since I was planning to use the same nginx controller cum loadbalancer which headlamp uses, we need to segregate their prefixes. I decided to access the llama server with prefix `/llama` so this extra config at the end. It basically rewrites the URLs of the requests once they are inside the cluster and strips off the prefix. This was not required in the headlamp's case because headlamp's URL prefix is configurable.

```
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: llama-cpp
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2

spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /llama(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: llama-cpp-service
            port:
              number: 80
```


### Accessing llama-cpp

Since I was accessing the llama-cpp from my Windows laptop (not WSL) I had to forward the port. Here is how I did it

```
# find the service
$ kk get svc -A | grep nginx
ingress-nginx      ingress-nginx-controller                             LoadBalancer   ...
ingress-nginx      ingress-nginx-controller-admission                   ClusterIP     ...

# forward :)
$ kubectl port-forward --namespace ingress-nginx svc/ingress-nginx-controller 2048:80
Forwarding from 127.0.0.1:2048 -> 80
Forwarding from [::1]:2048 -> 80
```
