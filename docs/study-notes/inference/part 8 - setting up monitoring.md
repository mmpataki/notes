date: 08-aug-2026
tags: #llama-cpp #k8s  #public

# Monitoring

Monitoring two fold activity
1. Metrics monitoring
2. Logging based monitoring

## Metrics Monitoring

For setting up monitoring I decided to go ahead with the Prometheus stack which comes with Prometheus, Grafana and Promtheus controller.

The advantage here is user don't need to create the scrapping configuration and upgrade the prometheus pods. We can just drop some ServiceMonitor objects in the cluster which will be picked by the controller and prometheus will automatically start scraping those metrics

Here is how to install it

```
$ helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
"prometheus-community" has been added to your repositories

$ helm install monitoring prometheus-community/kube-prometheus-stack
NAME: monitoring
LAST DEPLOYED: Thu Aug  6 18:56:25 2026
NAMESPACE: default
STATUS: deployed
REVISION: 1
DESCRIPTION: Install complete
TEST SUITE: None
NOTES:
kube-prometheus-stack has been installed. Check its status by running:
  kubectl --namespace default get pods -l "release=monitoring"

Get Grafana 'admin' user password by running:

  kubectl --namespace default get secrets monitoring-grafana -o jsonpath="{.data.admin-password}" | base64 -d ; echo

Access Grafana local instance:

  export POD_NAME=$(kubectl --namespace default get pod -l "app.kubernetes.io/name=grafana,app.kubernetes.io/instance=monitoring" -oname)
  kubectl --namespace default port-forward $POD_NAME 3000

Get your grafana admin user password by running:

  kubectl get secret --namespace default -l app.kubernetes.io/component=admin-secret -o jsonpath="{.items[0].data.admin-password}" | base64 --decode ; echo


Visit https://github.com/prometheus-operator/kube-prometheus for instructions on how to create & configure Alertmanager and Prometheus instances using the Operator.
```


Now for accessing this externally, I just setup a port forwarding :/

### Configuring the metrics scraping

The `ServiceMonitor` object is custom object under `monitoring.coreos.com`. To create one such object we need a pod selection filter and a named port

For llama-cpp service, I added the below config

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
    ...
    - name: metrics
      port: 9090
      targetPort: 8080
```

###### This is the ServiceMonitor

Notice how it matches the service label `metadata.labels.app`

```
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: llama-cpp-monitor
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: my-llama-app
  endpoints:
  - port: metrics
    path: /metrics
    interval: 10s
```


### ta-da!

![[Pasted image 20260808111314.png]]


## Logging

For this, I went with Alloy & Loki. Alloy processes logs from nodes and publishes them to Loki.

### Loki

Loki is a log aggregation platform by Grafana. It runs in 3 modes

- Distributed
- Monolithic
- SimpleScalable

I just went with Monolithic and installed it using helm. For loki's helm template, it is required to provide values  (to use Monolithic mode, minio for storage) especially, these -

###### loki-values.yml
```
loki:
  auth_enabled: true
  
deploymentMode: Monolithic

ignoreMinioDeprecation: true  # Temporary workaround – MinIO will be removed 2026-10-31
minio:
  enabled: true
```

###### Installation
```
$ helm install loki grafana-community/loki --namespace monitoring --create-namespace -f loki-values.yml
```


### Alloy

Alloy runs as a daemonset on all nodes, processes logs and forwards them to Loki.

###### Installation

```
$ helm repo add grafana https://grafana.github.io/helm-charts
"grafana" has been added to your repositories

$ helm repo update
Hang tight while we grab the latest from your chart repositories...
...Successfully got an update from the "headlamp" chart repository
...Successfully got an update from the "grafana" chart repository
...Successfully got an update from the "prometheus-community" chart repository
Update Complete. ⎈Happy Helming!⎈

$ kubectl create namespace alloy-monitoring
namespace/alloy-monitoring created

$ helm install --namespace alloy-monitoring alloy grafana/alloy
NAME: alloy
LAST DEPLOYED: Sat Aug  8 05:49:06 2026
NAMESPACE: alloy-monitoring
STATUS: deployed
REVISION: 1
DESCRIPTION: Install complete
TEST SUITE: None
NOTES:
Welcome to Grafana Alloy!
```


#### Configuration

Alloy is configured via a config set. The syntax used by alloy is HCL and I didn't go much in to specifics of it and used Claude to generate me a config. Once I had the config, setting it for the Alloy was easy


###### Alloy config change to use the config set (values.yaml)
```
alloy:
  configMap:
    # -- Create a new ConfigMap for the config file.
    create: false
    # -- Content to assign to the new ConfigMap.  This is passed into `tpl` allowing for templating from values.
    content: null

    # -- Name of existing ConfigMap to use. Used when create is false.
    name: alloy-config
    # -- Key in ConfigMap to get config from.
    key: config.alloy
```

###### Updating config set and Alloy
```
# uploading the config file content as value for a config set key "config.alloy"
$ kubectl create configmap --namespace alloy-monitoring alloy-config "--from-file=config.alloy=./alloy.conf"

# updating the Alloy to use this config set
helm upgrade --namespace alloy-monitoring alloy grafana/alloy -f values.yaml
```


### And there we go!

![[Pasted image 20260809103539.png]]