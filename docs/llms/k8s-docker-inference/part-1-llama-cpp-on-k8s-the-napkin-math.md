title: part 1 - llama.cpp on k8s, the napkin math
date: 06-aug-2026
tags: #docker #k8s #llama-cpp #public


# Goal
- setup a llama.cpp or sglang on a kubernetes cluster with GPU
- setup observability for it
- setup and run some benchmarks on it
	- measure TTS, TTFT
- Try out techniques such as
	- continuous batching
	- queuing
	- prometheus/grafana metrics & monitoring
	- log monitoring

- I want to try different inference engines like 
	- SGLang
	- Dynamo

# Idea

## Hardware

- HP laptop with
	- 64GB ram 
	- i7-13850 HX (2.1GHz) 28 cores
	- NVIDIA RTX 1000 Ada, 6GB VRAM

## Plan

Pick a small model, probably
- Qwen3-Coder-1.5B
- SmolLM2-360M-Instruct-Q4_K_M

##### Qwen3-Coder-1.5B will fit?
data type - fp16
model params require - 3GB, 3GB left
KV cache usage -
 = layers * n_heads * head_dim * 2 bytes * seq len * (1K + 1V)
 = 24 * 16 * 128 * 2 * 2 * 2048
 = 384 MBytes

We want to use 80% of the memory for KV cache, so left out memory is 3GB * 0.8
Number of sequences we can have in a batch
 = 3 * 1024 * 0.8 / 384
 = 6

So it fits!