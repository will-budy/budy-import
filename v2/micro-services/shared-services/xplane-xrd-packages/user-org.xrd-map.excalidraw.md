---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'


# Excalidraw Data

## Text Elements
 apiVersion : platform.budy.ob1.ai
kind: userOrg
metadata
    name
spec:
  userOrgShortName: acme
  userOrgFullName: "Acme Corp"
  serviceDeskRefs:
    - name: ob1-arcd-senior-living-jsm-service-desk-1
  digitalTeammates:
    - name: abcd
      spec
        DTManager
            - name: asd
              email: asd@asd.invalid
 ^c5ykhPP3

 apiVersion : database.service.budy.ob1.ai
kind: userOrgShortName
metadata
    name
spec
    userOrg : XXX
 ^n8v8rTc5

apiVersion: infra.budy/v1
kind: BudyTemporalObject
metadata:
  name: ob1-xpp-temporal-{userOrgShortName}-ns-1
spec:
  namespace:
    name: ob1-temporal-{userOrgShortName}-ns-1
    retention: 14d ^08UlUc6j

Proposed ^JRMm2B6T

Live ^eUtKNylH

Done differently OR Not done ^5N6EVwJS

apiVersion: v1
kind: Namespace
metadata:
  name: ob1-{userOrgShortName}-ns-2 ^hFS8kCda

apiVersion: mailgun.ob1.ai/v1alpha1
kind: Domain
metadata:
  name: ob1-xpp-mg-{userOrgShortName}-domain-1
  namespace: ob1-{userOrgShortName}-ns-2
spec:
  forProvider:
    subDomain: {userOrgShortName} ^5hdPe5Z1

apiVersion: jsm.atlassian.ob1.ai/v1alpha1
kind: JSMOrganization
metadata:
  name: ob1-xpp-jsm-{userOrg}-org-1
  namespace: ob1-{userOrg}-ns-2
spec:
  forProvider:
    name: {userOrgShortName}
    FullName: {userOrgFullName}
    serviceDeskRefs:
    - name: ob1-arcd-senior-living-jsm-service-desk-1 ^OowznScX

apiVersion: platform.budy.ob1.ai/v1alpha1
kind: DigitalTeammate
metadata:
  name: userOrg.spec.digitalTeamates.[0].name
  namespace: {Namespace}
spec:
  jiraSiteUrl: XXX
  mailgunDomain: XXX
  name: userOrg.spec.digitalTeamates.[0].name
  userOrgShortName: {userOrgShortName}
  endpointName: ob1-xpp-temporal-{userOrgShortName}-{userOrg.spec.digitalTeamates.[0].name}-1-1

status
  email: {name}@{mailgunDomain} ^r9Q8loRx

 apiVersion: mailgun.ob1.ai/v1alpha1
kind: Route
 ^2EHX0rCL

apiVersion: platform.budy.ob1.ai/v1alpha1
kind: DigitalTeammateAccount ^6IwYpfMz

apiVersion: platform.budy.ob1.ai/v1alpha1
kind: DigitalTeammateManagerAccount ^T2VpDmxr

List/Array ^RyMPt5Tl

apiVersion: jsm.atlassian.ob1.ai/v1alpha1
kind: JSMCustomer
metadata:
  name: gilfoyle-2
  namespace: ob1-budytest1-ns-2
spec:
  forProvider:
    displayName: Gilfoyle 2 Digital Teammate
    email: gilfoyle-2@budytest1.budy-bot.site ^n6E7RSwe

apiVersion: jsm.atlassian.ob1.ai/v1alpha1
kind: JSMOrganizationMembership
metadata:
  name: gilfoyle-2-org-membership-1
  namespace: ob1-budytest1-ns-2
spec:
  forProvider:
    customerRef:
      name: gilfoyle-2
    organizationRef:
      name: ob1-xpp-jsm-budytest1-org-1 ^EgQ2zz1c

apiVersion: jsm.atlassian.ob1.ai/v1alpha1
kind: JSMCustomer ^d8zMPLsx

apiVersion: jsm.atlassian.ob1.ai/v1alpha1
kind: JSMOrganizationMembership ^v6JC1fxL

apiVersion: platform.budy.ob1.ai/v1alpha1
kind: DigitalTeammateManagerAccount ^3CJPkEiB

apiVersion: platform.budy.ob1.ai/v1alpha1
kind: DigitalTeammateManagerAccount ^3IEftrtb

apiVersion: infra.budy/v1
kind: BudyTemporalObject
metadata:
  name: ob1-xpp-temporal-{userOrgShortName}-{digitalTeammateName}-nexus-endpoint-1
spec:
  nexusEndpoint:
    endpointName: ob1-xpp-temporal-{userOrgShortName}-{digitalTeammateName}-1-1 (passed by dt)
    namespace: {{ required "values.digitalTeammateNsChart.temporal.namespace is required" .Values.digitalTeammateNsChart.temporal.namespace }}
    taskQueue: {{ required "values.digitalTeammateNsChart.temporal.taskQueue is required" .Values.digitalTeammateNsChart.temporal.taskQueue }}
    description: "Nexus Service Endpoints. SERVICE_NAME: digital-entity-service-2." ^rjvO11oa

apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{ printf "dt-%s-%s-app-1" .Values.digitalTeammateNsChart.tenant.userOrgShortName .Values.digitalTeammateNsChart.tenant.digitalTeammateName }}
  namespace: ob1-tf-eks-de-v2-platform-1-ns-1(For de-v2)
spec:
  destination:
    namespace: ob1-budytest1-ns-2
    server: https://kubernetes.default.svc
  project: fnd-autoscaling-acd-proj-1
  sources:
    - chart: digitalTeammateNsChart
      helm:
        releaseName: digitalTeammateNsChart
      repoURL: https://github.com/Budybot/ob1_mn_github_budy-platform-crs-1_repo_1
      path: v1/stacks/budy-dt-creaeted-resources/chart/digitalteammate-ns-chart-1
      targetRevision: HEAD(dev) ...
   
   ^jal4asTf

apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{ printf "dt-%s-%s-de-shell-app-1" .Values.digitalTeammateNsChart.tenant.userOrgShortName .Values.digitalTeammateNsChart.tenant.digitalTeammateName }}
  namespace: ob1-tf-eks-de-v2-platform-1-ns-1(For de-v2)
spec:
  project: apps-userorg-apps-acd-proj-1
  source:
    repoURL: 745404749629.dkr.ecr.us-west-2.amazonaws.com/ob1-helm-chart-repo-v1
    chart: de-shell-1-repo-1
    targetRevision: {{ required "digitalTeammateNsChart.version is required" .Values.digitalTeammateNsChart.version | quote }}
    helm:
      values: |
        tenant:
          userOrgShortName: {{ include "userOrgShortName" . | quote }}
          digitalTeammateName: {{ include "digitalTeammateName" . | quote }}
        temporal:
          address: {{ required "values.digitalTeammateNsChart.temporal.address is required" .Values.digitalTeammateNsChart.temporal.address | quote }}
          taskQueue: {{ required "values.digitalTeammateNsChart.temporal.taskQueue is required" .Values.digitalTeammateNsChart.temporal.taskQueue | quote }}
          namespace: {{ required "values.digitalTeammateNsChart.temporal.namespace is required" .Values.digitalTeammateNsChart.temporal.namespace | quote }}
  destination:
    server: https://kubernetes.default.svc
    namespace: {{ .Release.Namespace }}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true ^HT4VI4UF

apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: istio-peer-auth-mtls
  namespace: {Namespace}
spec:
  mtls:
    mode: STRICT ^bUnflDPe

apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  labels:
    app.kubernetes.io/namespace: {{ .Release.Namespace }}
  name: {{ printf "%s-%s" .Release.Namespace .Values.cilium.allowPolicyNameSuffix }}
  namespace: {{ .Release.Namespace }}
spec:
  endpointSelector:
    matchLabels:
      "budy.io/digital-teammate-name": {{ include "digitalTeammateName" . | quote }}
    matchExpressions:
      - key: "budy.io/digital-teammate-name"
        operator: In
        values:
          - {{ include "digitalTeammateName" . | quote }}
  egress:
    - toEndpoints:
        - matchLabels:
            "k8s:io.kubernetes.pod.namespace": ob1-tf-eks-temporal-ns-1
            "k8s:app.kubernetes.io/instance": temporal-cluster-2
            "k8s:app.kubernetes.io/component": frontend
      toPorts:
        - ports:
            - port: "7233"
              protocol: TCP
            - port: "7243"
              protocol: TCP
    - toEndpoints:
        - matchLabels:
            "k8s:io.kubernetes.pod.namespace": ob1-tf-eks-vault-ns-1
            "k8s:app.kubernetes.io/name": vault
            "k8s:app.kubernetes.io/instance": vault-cluster-2
            "k8s:component": server
      toPorts:
        - ports:
            - port: "8200"
              protocol: TCP
    - toEndpoints:
        - matchLabels:
            "k8s:io.kubernetes.pod.namespace": kube-system
            "k8s:k8s-app": kube-dns
      toPorts:
        - ports:
            - port: "53"
              protocol: UDP
            - port: "53"
              protocol: TCP
    - toEndpoints:
        - matchLabels:
            "k8s:io.kubernetes.pod.namespace": ob1-tf-eks-istio-system-ns-1
            "k8s:app": istiod
      toPorts:
        - ports:
            - port: "15012"
              protocol: TCP
 ^QYWntPMB

apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: egress-allow-required-only
  namespace: {Namespace}
spec:
  action: ALLOW
  rules:(put it to env)
    - to: 
        - operation:
            hosts: ["temporal-cluster-2-frontend.ob1-tf-eks-temporal-ns-1.svc.cluster.local"]
            ports: ["7233", "7243"]
    - to:
        - operation:
            hosts: ["vault-cluster-2-active.ob1-tf-eks-vault-ns-1.svc.cluster.local"] 
            ports: ["8200"]
    - to:
        - operation:
            hosts: ["*.kube-system.svc.cluster.local"]
            ports: ["53"]
    - to:
        - operation:
            hosts: ["*.ob1-tf-eks-istio-system-ns-1.svc.cluster.local"]
            ports: ["15012"]
     - to:
         - operation:
             hosts: ["database-services-l1-kfk.ob1-tf-eks-design-services-1-ns-1.svc.cluster.local"]
             ports: ["3000"]
 ^YcYjnldk

apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  labels:
    app.kubernetes.io/controlled-by: k8s-security-stack
  name: namespace-wide-egress-deny-missing-app-label
  namespace: {Namespace}
spec:
endpointSelector:
    matchExpressions:
      - key: "budy.io/user-org-short-name"
        operator: DoesNotExist
  egressDeny:
    - toEntities:
        - cluster
        - world
        - host
        - remote-node
        - kube-apiserver
        - unmanaged
        - health
        - init
# for every pod that runs in the userorg namespace, 
we need to add a lable "user-org-short-name"
    
  ^JUZwY39W

apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: {{ printf "%s-%s-meeting-manager-role" (include "userOrgShortName" .) (include "digitalTeammateName" .) }}
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/namespace: {{ .Release.Namespace }}
rules:
  - apiGroups:
      - meeting.budy.b1.ai
    resources:
      - meetings
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ include "digitalteammate-ns-chart-1.resourceName" (dict "Values" .Values "component" "worker" "resource" "meeting-manager-rolebinding") }}
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/namespace: {{ .Release.Namespace }}
subjects:
  - kind: ServiceAccount
    name: {{ include "digitalteammate-ns-chart-1.serviceAccountName" . }}
    namespace: {{ include "digitalteammate-ns-chart-1.serviceAccountNamespace" .}}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: {{ printf "%s-%s-meeting-manager-role" (include "userOrgShortName" .) (include "digitalTeammateName" .) }}

--
JSM, DT ^zRUikbNG


 ^YdpnZYCI


 ^zljTNxdj

%%
## Drawing
```compressed-json
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
```
%%