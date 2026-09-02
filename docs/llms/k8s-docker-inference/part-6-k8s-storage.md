title: part 6 - k8s storage
date: 06-aug-2026
tags: #k8s #pv #storage #public


I wanted to pass the model files to the `llama-cpp` pods from the WSL dir / kind node directories by mounting volumes but this is a IO heavy operation.

Instead I thought of separating model storage from nodes and this is where k8s storage options come in picture. Two concepts 

## 1. PV - persistent volume

This is a definition of a storage unit. Can be local disk / S3 / NFS anything which can store. You define it (size, location etc), add it to cluster. This one declares a 10GB space on **Kind nodes**

```
apiVersion: v1
kind: PersistentVolume
metadata:
  name: models-pv
spec:
  capacity:
    storage: 10G
  accessModes:
    - ReadOnlyMany
  persistentVolumeReclaimPolicy: Retain
  hostPath:
    path: /home/mmp/llm-models
```

In cloud world, `StorageClass` objects are defined which basically define the provider of storage and a storage provisioner (CSI - container storage interface) is installed in the cluster which does the instantiation of storage PVs.


## 2. PVC - persistent volume claims

PVs declare a storage but they don't associate them with the pods. This association is done by the PV Claim objects. Why are they separate?

The people managing PV and PVC are different irl. Users of PV don't need to know whether they are on Azure / GCP / AWS, what are the credentials, what is the performance tier etc. They just need to know they need 20GB and they need a high io-throughput one.

This separation helps in achieving it. Here is how a PVC looks like

```
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: models-dynamic-pvc
spec:
  resources:
    requests:
      storage: 10G
  volumeMode: Filesystem
  accessModes:
    - ReadWriteOnce
```

Here is how a deployment spec uses this claim

```
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - image: docker.io/library/llama-cpp:latest
        ...
        volumeMounts:
          - name: models
            mountPath: /models
      volumes:
        - name: models
          persistentVolumeClaim:
            claimName: models-dynamic-pvc
```

You can query both PV and PVCs like this

```
$ kk get pv
NAME                                       CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                        STORAGECLASS   VOLUMEATTRIBUTESCLASS   REASON   AGE
pvc-4692cc26-c996-4438-b95e-65344abbf74e   10G        RWO            Delete           Bound    default/models-dynamic-pvc   standard       <unset>                          17h
```

##### Getting the pvcs
Note this one is bound and refers to PV - `pvc-4692cc26-c996-4438-b95e-65344abbf74e`

```
$ kk get pvc
NAME                 STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
models-dynamic-pvc   Bound    pvc-4692cc26-c996-4438-b95e-65344abbf74e   10G        RWO            standard       <unset>                 17h
```


A single PVC can be bound to one or many **nodes** (not pods), this can be allowed by `accessModes`. these are valid values

- ReadWriteOnce (RWO) - only one node mounts it
- ReadOnlyMany (ROX) - many nodes can mount in readonly mode
- ReadWriteMany (RWX) - many nodes can mount

### Note

PVCs are just named volume-claims, if you want a new volume for a new pod, you need some how templatize it. The keyword is - `volumeClaimTemplates`

## A bug

If you notice carefully, the PV is defined to be RXO but the PVC is said to be RWO. So when the pod refers the pvc to bind the PV to pod, it will not match and standard provisioner (default one, since nothing is mentioned in PVC) will automatically create a new PV.

That's why we don't see VOLUME=models-pv in above output