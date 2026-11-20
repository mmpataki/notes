title: BPF for storage - an exokernel inspired approach
tags: #ebpf #storage #optimization #public
date: 29 Jan 2026

# Authors

- **Columbia University**
	Yu Jian Wu, Hongyi Wang, Yuhong Zhong, Junfeng Yang, Asaf Cidon
- **University of Utah**
	Ryan Stutsman
- **VMware Research**
	Amy Tai

# Abstract

The NVMe chips are a lot faster nowadays and the Linux kernel driver and userland function calls are actually add a latency (~30%) while doing the BIO. 

This is noted significantly in the applications which work on block level (eg. Databases) or exokernel based applications.

In this paper the author implements a application specific block read algorithm and injects it in to different layers of the Kernel BIO (NVMe SSD) stack to improve the performance of the BIO by eliminating a lot of call frames from the stack.

# Links
Paper - https://arxiv.org/pdf/2102.12922

