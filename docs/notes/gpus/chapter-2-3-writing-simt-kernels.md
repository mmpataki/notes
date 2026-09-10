title: Chapter 2.3 - Writing SIMT Kernels
tags: #public
date: 1 june 2026
link: https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html

## Thread index

threadIdx.[xyz]
blockIdx.[xyz]

### Linearization
x moves the fastest, followed by y and z.

## Synchronization
`__syncthreads()` - used for within thread block sync.


## GPU device memory types
| Memory Type | Scope  | Lifetime    | Location |                                         |
| ----------- | ------ | ----------- | -------- | --------------------------------------- |
| Global      | Grid   | Application | Device   | computation output, inputs              |
| Constant    | Grid   | Application | Device   |                                         |
| Shared      | Block  | Kernel      | SM       | low latency, sync using `__syncthreads` |
| Local       | Thread | Kernel      | Device   |                                         |
| Register    | Thread | Kernel      | SM       |                                         |

### Shared memory

The shared memory is shared by L1 cache

#### Static allocation
```
__shared__ float sharedArray[1024];
```

#### Dynamic allocation

##### First is allocating
```
func<<<gridDim, blockDim, shMemSize>>>();
```

This can be referred by 
```
extern __shared__ float sharedArray[];
```

Problem is you can have only one shmem per kernel, so you need to manually partition it. Example

```
extern __shared__ float array[];

short* array0 = (short*)array;
float* array1 = (float*)&array0[128];
int*   array2 =   (int*)&array1[64];
```

### Shared memory sizes

| Architecture    | Compute Capability | Default per-block | Maximum per-block (opt-in) | Shared/L1 pool |
| --------------- | ------------------ | ----------------- | -------------------------- | -------------- |
| Fermi           | 2.x                | 48 KB             | 48 KB                      | 64 KB          |
| Kepler          | 3.x                | 48 KB             | 48 KB                      | 64 KB          |
| Maxwell         | 5.0 / 5.2          | 48 KB             | 48 KB                      | 96 KB          |
| Maxwell (GM20B) | 5.3                | 48 KB             | 64 KB                      | 96 KB          |
| Pascal          | 6.0                | 48 KB             | 64 KB                      | 96 KB          |
| Pascal          | 6.1 / 6.2          | 48 KB             | 48 KB                      | 96 KB          |
| Volta           | 7.0                | 48 KB             | 96 KB                      | 128 KB         |
| Turing          | 7.5                | 48 KB             | 64 KB                      | 96 KB          |
| Ampere (GA100)  | 8.0                | 48 KB             | 163 KB                     | 192 KB         |
| Ampere (GA10x)  | 8.6                | 48 KB             | 99 KB                      | 128 KB         |
| Ada Lovelace    | 8.9                | 48 KB             | 99 KB                      | 128 KB         |
| Hopper          | 9.0                | 48 KB             | 227 KB                     | 256 KB         |
## Shared memory banks

The shared memory is divided in to **32 banks** such that consecutive 32 bites go in to successive banks. When two different addresses are sent to a bank, **bank conflict** happens and the processing is **serialized**

https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html#writing-cuda-kernels-shared-memory-5-x-examples-of-strided-shared-memory-accesses

Kernels exploit this nature to be efficient in memory access. Eg. transpose kernel.

