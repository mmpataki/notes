title: Chapter 2.1 - CUDA with C++
tags: #public 
wdate: 31 may 2026
link: https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/intro-to-cuda-cpp.html


nvcc compiler driver.
CUDA has two APIs
1. Runtime API - exposes Driver API - memcpy, kernel launch etc.
2. Driver API - low level


CCCL - Cuda core compute library -- looks like a utility library
https://nvidia.github.io/cccl/unstable/

> The choice of 256 threads per block here is arbitrary, but this is quite often a good value to start with.

Why is this a good value?
An SM has warps with 32 




# Virtual / Physical

| Virtual / Physical | Unit name            | Ampere A100/SM | Ada (RTX 4090)/SM |
| ------------------ | -------------------- | -------------- | ----------------- |
| Physical           | Scheduler            | 4              | 4                 |
|                    | INT32 unit           | 64             | 64                |
|                    | FP32 unit            | 64             | 128               |
|                    | Registers            |                |                   |
|                    | Special fn. units    |                |                   |
|                    | Dispatch unit        | 4              |                   |
|                    | Tensor core pipeline | 4              |                   |
| Virtual            | Warp                 |                |                   |
|                    | Thread               |                |                   |
|                    | Block                |                |                   |
In principle the numbers add up as well, but in reality the execution is hugely pipelined and the mapping is not linear.



# Memory

## Unified memory
You can allocate memory on unified memory using 
- cudaMallocManaged
- `__managed__` specifier

NVIDIA driver will handle the memory movement.


### APIs
- cudaMemcpy
	- cudaMemcpyDefault
	- cudaMemcpyHostToDevice
	- cudaMemcpyDeviceToHost
	- cudaMemcpyDeviceToDevice
- cudaMalloc
- cudaMallocHost - allocates page locked memory
- cudaMallocManaged


## Synchronizing CPU and GPU
`cudaDeviceSynchronize` - waits for all the streams (submissions) of the kernels to finish and makes the CPU thread stall for it.

You can use [Stream Sync](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/asynchronous-execution.html#async-execution-stream-synchronization) API to solve this and wait for particular events

## Synchronizing within threads of a block
This can be done by calling `__syncthreads()` and threads within a block can use the shared memory as well. `__syncthreads()` is light weight.

It's suggested to synchronize threads within a block and not across blocks for performance although its doable using cooperation api and thread block clusters.

## Runtime initialization
CUDA runtime creates a per device context when the first API is called. This context is shared among all the threads of the application and is transparently done. Also the device code is JIT compiled and copied to device as part of context initialization

This context can be accessed thru API. 

## Error handling

All APIs return `cudaError_t` which can be checked using below.

```
#define CUDA_CHECK(expr_to_check) do {            \
    cudaError_t result  = expr_to_check;          \
    if(result != cudaSuccess)                     \
    {                                             \
        fprintf(stderr,                           \
                "CUDA Runtime Error: %s:%i:%d = %s\n", \
                __FILE__,                         \
                __LINE__,                         \
                result,\
                cudaGetErrorString(result));      \
    }                                             \
} while(0)
```


## Error state
Cuda maintains a `cudaError_t` state per host thread which can be queried using a `cudaGetLastError` and `cudaPeekAtlasError` APIs. Former one resets the state.

This is useful to query the kernel submission state.

## Error logs
CUDA can even log to a file if specified using the env `CUDA_LOG_FILE`. The driver logs errors to this file.

## Device and Host functions

`__global__` - for kernels
`__device__` - for functions to be called by kernels or other device functions
`__host__` - for functions on host

## Variable specifiers
`__device__` lives in global memory
`__constant__` constant memory
`__managed__` uniform memory
`__shared__` shared memory

Any variable with no specifier in the kernel or device function is allocated a register or local memory

## Device specific compilation
If you write a function for both device and host (using both specifiers), you may want to write specific pieces of code for host / device. In that case, we can use macro to check `__CUDA_ARCH_`

## Thread block clusters
Max blocks per cluster is 8 (All blocks in a cluster run simultaneously inside a GPC)
If the device is not capable of 8 SM, the max is configured to whatever is available

One can check the max size 
`cudaOccupancyMaxPotentialClusterSize`

Inside a kernel running in a cluster, you can query the number of threads and blocks using `num_blocks()` and `num_threads()`. The rank of a thread or block can be queried using `dim_threads()` or `dim_blocks()` 

Thread blocks in the cluster have access to distributed shared memory which is the combined shared memory of all thread blocks

The cluster dims is mentioned by `__cluster_dims__(x, y, z)` on the kernel as a compiler attribute. 

> **Interesting**
> 
> Interestingly, the scheduler picks the contiguous thread blocks from the grid and schedules them as cluster.
> This doesn't leave much control for the programmer to do proper sync **is what I feel**

### No cluster support prior to sm_90

```
$ nvcc vector_add.cu 
ptxas /tmp/tmpxft_0032deea_00000000-6_vector_add.ptx, line 20; error   : Feature '.explicitcluster' requires .target sm_90 or higher
ptxas /tmp/tmpxft_0032deea_00000000-6_vector_add.ptx, line 21; error   : Feature '.reqnctapercluster' requires .target sm_90 or higher
ptxas fatal   : Ptx assembly aborted due to errors
```
