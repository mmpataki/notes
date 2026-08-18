date: 15-aug-2026
tags: #storage #k8s  #public

I noticed that both of my pods were running in a same node. This will cause lesser utilization of my cluster resources. To move the pods to other node, there are few options

1. Daemon set
2. Topology spread constraints
3. Pod anti-affinity


I decided to experiment with 2nd option "Topology spread constraints" because it looked clean. In this option, you tell k8s how much skew is permissible in terms of number of pods on a node. For my case, I want the max difference in number of pods of my app to be 1

This option goes on pod spec (deployment/spec.template.spec)

```
topologySpreadConstraints:
  - maxSkew: 1
	topologyKey: kubernetes.io/hostname
	whenUnsatisfiable: DoNotSchedule
	labelSelector:
	  matchLabels:
		name: my-llama-app
```


But this put 2 of my pods in `Unschedulable` state. The error was

```
0/4 nodes are available: 1 Insufficient cpu, 1 node(s) had untolerated taint(s), 2 node(s) didn't match PersistentVolume's node affinity. no new claims to deallocate, preemption: 0/4 nodes are available: 1 No preemption victims found for incoming pod, 3 Preemption is not helpful for scheduling.
```

This is because the PV had the `accessMode` set to `ReadWriteOnce` which allows only one node to mount it. So, I tried to change it to `ReadOnlyMany`. But that failed with 

```
failed to provision volume with StorageClass "standard": NodePath only supports ReadWriteOnce and ReadWriteOncePod (1.22+) access modes
```


In my cluster `standard` storage class (rancher's node-path) doesn't allow `ReadOnlyMany`. Because the path is not available on other nodes (since its "node path").


## Solution

I chose this approach. 

- We will have a S3 kind of distributed blob storage which will have model GGUF files.
- Once a pod starts, we will clone the model blob to a pod local (ephemeral) directory
- the pod loads this and works
- once the pod is evicted, the model file also gets cleaned up

There are some obvious disadvantages of this method
- Download happens each time a pod is scheduled
- If a pod gets evicted and a new pod starts on a same node, new one doesn't use the earlier downloaded model

To solve this, we need a node local persistent path which has to be dynamically allocated and storages like `local` or `hostPath` allow this. But then they come with some constraints and security concerns

We can go for dynamic PVs but they are not available for `DaemonSet` or `Deployments`. So `StatefulSet` is the only option but since we don't have any "state" to care about, it would be an anti-pattern.

So, I chose `minio` as my blob storage (runs in my cluster) for hosting model files and `emptyDir` volumes as local download directory 

## installing `minio`

`minio` has evolved in to `ai stor` a commercial blob storage for AI applications??? Installing it seemed pretty easy.

```
helm repo add minio https://charts.min.io/
helm repo update

kubectl create namespace minio

helm install minio minio/minio \
  -n minio \
  --set rootUser=minio \
  --set rootPassword='some-password'
```

But this installation came up with defaults like 16 pods and my smaller cluster didn't have much resources to run them so most of the pods went in to `Pending` state.

I could have got the helm values and set the replicas count or something to ~3 but out of patience I googled and found a easy approach - `minio-operator`. 

#### Operators
Operators basically watch config changes for particular type of k8s resource events and deploy / make necessary changes to applications. I got the recently archieved version of minio operator and installed it

```
kubectl apply -k "github.com/minio/operator?ref=v7.0.1"
```

This operator looks for events on objects of type `minio.min.io/Tenant` and manages per tenant minio application deployments. A tenant definition looks like [this](https://github.com/mmpataki/k8s-llama/)

```
apiVersion: minio.min.io/v2
kind: Tenant
metadata:
  name: minio
  namespace: minio
spec:
  requestAutoCert: true
  configuration:
    name: storage-configuration
  image: quay.io/minio/minio:RELEASE.2024-10-02T17-50-41Z
  mountPath: /export
  pools:
  - name: pool-0
    servers: 3
    volumesPerServer: 3
    volumeClaimTemplate:
      spec:
        accessModes:
        - ReadWriteOnce
        resources:
          requests:
            storage: 1Gi
        storageClassName: standard
  users:
  - name: storage-user
```


#### Interfaces of minio

minio provides a GUI and CLI (named mc). GUI is exposed through a https port 9443 for which we need to create a LoadBalancer to use externally. Here are the service we get from deploying a tenant

```
$ kk get svc -n minio
NAME                 TYPE           CLUSTER-IP      EXTERNAL-IP      PORT(S)                         AGE
minio                ClusterIP      10.96.86.106    <none>           443/TCP                         2d3h
minio-console        ClusterIP      10.96.224.90    <none>           9443/TCP                        2d3h
minio-hl             ClusterIP      None            <none>           9000/TCP                        2d3h
minio-loadbalancer   LoadBalancer   10.96.109.205   172.18.255.201   9000:30900/TCP,9443:31568/TCP   3d6h
```

#### Copying models to min

```
mc --insecure alias set local https://localhost:9000 minio some-password
mc --insecure mb local/models
mc --insecure cp ~/llm-models/SmolLM2-360M-Instruct-Q4_K_M.gguf local/models/
```


#### Auto downloading the models on pod start

This can be achieved by an initContainer which runs to initialize a pod. Notice the usage of `<pod>.<namespace>.svc.cluster.local` format of the hostname

```
initContainers:
  - name: download-model
	image: minio/mc
	command:
	  - /bin/sh
	  - -c
	  - |
		mc --insecure alias set minio https://minio.minio.svc.cluster.local "$MINIO_USER" "$MINIO_PASSWORD"
		mc --insecure cp minio/models/SmolLM2-360M-Instruct-Q4_K_M.gguf /models/SmolLM2-360M-Instruct-Q4_K_M.gguf
	env:
	  - name: MINIO_USER
		valueFrom:
		  secretKeyRef:
			name: minio-credentials
			key: username
	  - name: MINIO_PASSWORD
		valueFrom:
		  secretKeyRef:
			name: minio-credentials
			key: password
	volumeMounts:
	  - name: models
		mountPath: /models
```


