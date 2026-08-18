date: 06-aug-2026
tags: #k8s #headlamp #public


I was really bored with the kubectl cli to get the details everytime and wanted a GUI tool to explore the objects in my cluster and that's when I found `headlamp`

# headlamp

headlamp is a GUI based management tool for k8s which can be dropped in your cluster. It can be installed as a separate docker as well.

Since I didn't want to manage the overhead of configuring the headlamp deployment on my own, I chose to use a k8s package management tool - `helm`!


# helm 

is sort of a package manager for k8s. you can register registries and install deployments and other things on your cluster in few commands. To install headlamp, here were the commands

```
helm install headlamp headlamp/headlamp \
  --namespace headlamp \
  --create-namespace
```


this creates a new namespace and puts the headlamp deployment in it. The server listens on some container internal port (4646) and we need to forward it to a host port.

To do the port forwarding, we use

```
kubectl --namespace headlamp port-forward $POD_NAME 40000:$CONTAINER_PORT
```

But this is really painful, every time I need to find the pod name and setup the forwarding to access the UI.


## Solution - Ingress (-controller)

k8s has a concept of a ingress which is a definition of a incoming n/w routing setup. Ingress-controller uses these definitions to do the routing. The routing rules can be defined at application levels as well (like HTTP etc.)

### Solution idea

- Setup a ingress controller (nginx based one)
- Configure a ingress
- When HTTP requests have a path prefix `/headlamp` route those requests to headlamp pod.
- Instead of using `host:port/` to access the headlamp, we will use `host:port/headlamp`


##### Ingress definition

```
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: headlamp
  namespace: headlamp

spec:
  type: NodePort
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /headlamp
        pathType: Prefix
        backend:
          service:
            name: headlamp
            port:
              number: 80
```


We also need to tell the headlamp container to host the urls with prefix `/headlamp`. To do this, we need to do 

```
helm upgrade headlamp headlamp/headlamp \
  -n headlamp \
  --set config.baseURL=/headlamp
```


Just having an ingress rule is not sufficient as it's just a definition, there should be a active process which uses these rules, which is called ingress controller. Otherwise we will see that there will be no **external IP** for our service

```
$ kubectl get svc -A
NAMESPACE     NAME         TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)                  AGE
default       kubernetes   ClusterIP   10.96.0.1     <none>        443/TCP                  8h
headlamp      headlamp     ClusterIP   10.96.51.46   <none>        80/TCP                   12m
kube-system   kube-dns     ClusterIP   10.96.0.10    <none>        53/UDP,53/TCP,9153/TCP   8h
```

You can get the ingress and check its class which basically specifies the type of the ingress rule it's. ingress-controller may filter for ingress' which it might support and provision them

```
$ kubectl get ingress -n headlamp
NAME       CLASS    HOSTS   ADDRESS   PORTS   AGE
headlamp   <none>   *                 80      7m19s
```

There are many ingress-controllers to pick from (from third-party).

tags: #todo  #public
Ingress API is frozen and k8s suggest using Gateway now. (need to explore this)


#### nginx ingress-controller

installed a nginx based ingress controller.

```
$ kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
namespace/ingress-nginx created
serviceaccount/ingress-nginx created
serviceaccount/ingress-nginx-admission created
role.rbac.authorization.k8s.io/ingress-nginx created
role.rbac.authorization.k8s.io/ingress-nginx-admission created
clusterrole.rbac.authorization.k8s.io/ingress-nginx created
clusterrole.rbac.authorization.k8s.io/ingress-nginx-admission created
rolebinding.rbac.authorization.k8s.io/ingress-nginx created
rolebinding.rbac.authorization.k8s.io/ingress-nginx-admission created
clusterrolebinding.rbac.authorization.k8s.io/ingress-nginx created
clusterrolebinding.rbac.authorization.k8s.io/ingress-nginx-admission created
configmap/ingress-nginx-controller created
service/ingress-nginx-controller created
service/ingress-nginx-controller-admission created
deployment.apps/ingress-nginx-controller created
job.batch/ingress-nginx-admission-create created
job.batch/ingress-nginx-admission-patch created
ingressclass.networking.k8s.io/nginx created
validatingwebhookconfiguration.admissionregistration.k8s.io/ingress-nginx-admission created
```

Now we can see the ingress

```
$ kubectl describe ingress headlamp -n headlamp
Name:             headlamp
Labels:           <none>
Namespace:        headlamp
Address:          localhost
Ingress Class:    nginx
Default backend:  <default>
Rules:
  Host        Path  Backends
  ----        ----  --------
  *
              /headlamp   headlamp:80 (10.244.1.3:4466)
Annotations:  <none>
Events:       <none>
```


notice the ingress class and address were not set earlier

```
$ kubectl describe ingress -n headlamp
Name:             headlamp
Labels:           <none>
Namespace:        headlamp
Address:          
Ingress Class:    <none>
Default backend:  <default>
Rules:
  Host        Path  Backends
  ----        ----  --------
  *           
              /headlamp   headlamp:80 (10.244.1.3:4466)
```


##### How is external traffic getting in to the cluster through this ingress-controller?
Notice we have an external IP for this controller.

```
$ kk get svc -n ingress-nginx
NAME                                 TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)                      AGE
ingress-nginx-controller             LoadBalancer   10.96.93.41    172.18.255.200   80:31886/TCP,443:30662/TCP   21h
ingress-nginx-controller-admission   ClusterIP      10.96.24.154   <none>           443/TCP                      21h
```

And for this external IP, we should have a routing rule in the node routing table

```
$ route
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
default         172.19.112.1    0.0.0.0         UG    0      0        0 eth0
10.62.0.0       0.0.0.0         255.255.0.0     U     0      0        0 openfaas0
172.17.0.0      0.0.0.0         255.255.0.0     U     0      0        0 docker0
172.18.0.0      0.0.0.0         255.255.0.0     U     0      0        0 br-e0fad6b81df1
172.19.112.0    0.0.0.0         255.255.240.0   U     0      0        0 eth0
```

#### Accessing via Windows

Now the headlamp is available in the WSL but not in windows, this is because docker has setup the routing tables for the WSL. So Windows' connections don't route here. (I tried setting up that but it didn't help, prolly my org has firewall asetup on my laptop which blocks this - #todo )

##### port forwarding

To solve this, I took a boring approach (I could have simply had a browser installed in WSL) and created a port forwarding

Here I am forwarding all traffic on 40000 (from host machine) to 4646 on `<podname>`

```
kubectl --namespace headlamp port-forward <podname> 40000:4646
```

