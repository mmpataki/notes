date: 06-aug-2026
tags: #k8s #networking #public

## Lil' bit on k8s networking

Every node obviously has one IP address.

```
 kk get nodes -o yaml | grep address
    addresses:
    - address: 172.18.0.3
    - address: kind-control-plane
    addresses:
    - address: 172.18.0.5
    - address: kind-worker
    addresses:
    - address: 172.18.0.4
    - address: kind-worker2
    addresses:
    - address: 172.18.0.2
    - address: kind-worker3
```


Each pod in a cluster also gets a cluster IP (listing the headlamp pods here). 

```
$ kk get pods -o yaml -n headlamp | grep IP: -i
    hostIP: 172.18.0.5
    - ip: 172.18.0.5
    podIP: 10.244.1.3
    - ip: 10.244.1.3
```


Let's assume there are many replicas of a pod for a deployment (app) A. If some pod in the cluster wants to talk to app A, it has to know the cluster IP addresses of all the pods in the cluster to connect to them. It also has to check whether for pod's status.

To solve this problem, k8s introduced concept of `Service`

### Service

You declare a service and deploy it. Kubernetes nodes (esp. kubeproxy component of the node) get this detail (they listen to cluster changes) and apply routing rules in their nodes. The routing and load balancing is taken care by Linux kernel there after.

Here is how you declare a k8s Service (look how serving pods are selected)

```
apiVersion: v1
kind: Service
metadata:
  name: my-service
  labels:
    app: my-app
spec:
  selector:
    name: my-app
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

Now any pod can reach out to pods in this service by using DNS name `my-service`. You can get its IP as well

```
$ kk get svc my-service
NAME                TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)           AGE
my-service          ClusterIP   10.96.42.4   <none>        80/TCP            17h
```

Notice the type=ClusterIP, we will come back to that in sec.


### External reachability - NodePort & LoadBalancer

Internal pods are able to reach the other pods using a stable fixed DNS name / IP, how will external traffic land on these pods?

There are two solutions

#### NodePort

You create a service of type `NodePort` and all cluster nodes listen on that. If a packet comes on that port, the kernel (whose routing table is configured by kubeproxy) routes the traffic to the `clusterip:interal-port` pair.

#### LoadBalancer

This builds on top of `NodePort`. You can either install a loadbalancer application / use a cloud load balancer and it will either use (in earlier days) NodePort or direct pod resolution and forward the traffic to the internal pods.


#### Ingress

This gives more control over the traffic than load-balancer. LoadBalancer just balances the n/w traffic but this one allows you to do custom routing / changing the requests etc features.
