title: Chapter 0 - Cuda book
date: 30 may 2026
tags: #public 

G80 processor - introduced CUDA

before 2006 only the graphics api was available for prallel programming in GPU known as GPGPU. but now with NVIDIA brining the CUDA model, its' easier to write geneal programs for GPU

CUDA - Compute Unified Device Architecture

Architecture of a CUDA capable GPU 

In this diagram there are 8 building blocks
Each building block has 2 SMs (Streaming Multi-Processors)
Each SM has many SPs (Streaming processors)
all SPs share a single control logic and iCache

GPU is connected to Graphics DDR (GDDR) ram which is very high bandwidth RAM compared to system ram. It's slow but it's parallelism makes up for latency.


![[Pasted image 20260530111023.png]]
