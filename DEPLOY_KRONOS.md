Deploying the Kronos service (overview)
=====================================

This document describes options to deploy the real Kronos Python service publicly and configure your app to use it.

Prerequisites
-------------
- A Docker image for the service (we provide a `Dockerfile` in `python-kronos-service/`).
- A public host (Render, AWS ECS, GCP Cloud Run, or a VM with a public IP).
- If running the real model: a local `kronos/` clone or public git URL, and PyTorch installed (GPU recommended for large models).

Quick path (recommended for demo)
---------------------------------
1. Build and push the image to a registry (GitHub Container Registry):

   - Configure the GitHub Actions workflow secrets (GHCR uses `GITHUB_TOKEN` by default).
   - Run the `Build and push Kronos service image` workflow (Actions → run workflow).

2. Deploy the image to Render (or similar):

   - Create a new Web Service on Render.
   - Choose Docker image and connect to your GitHub Container Registry image `ghcr.io/<owner>/gr8bux-kronos:latest`.
   - Set the service to expose port `8000`.
   - (Optional) Choose a machine with adequate CPU / GPU.

3. Set the `KRONOS_API_URL` environment variable in your Next.js hosting (Netlify/Vercel/Render) to the public URL of the Kronos service, e.g. `https://kronos.example.com`.

Notes for production / model-backed service
-----------------------------------------
- If you want real, performant inference, pick a host that provides GPU instances (AWS EC2 with CUDA, GCP GPU, or managed GPU infra).
- Install torch with the correct CUDA variant when building the image (modify `INSTALL_TORCH_CPU` and install the appropriate wheel).
- Ensure large model weights (if pulled at runtime) have bandwidth and storage; consider preloading and caching them.

AWS ECS / ECR flow (summary)
----------------------------
1. Build image locally or via GitHub Actions and push to ECR.
2. Create an ECS service on Fargate or EC2 with the image and desired instance type (GPU requires EC2).
3. Configure security groups to expose port 8000 and attach a public load balancer.
4. Set `KRONOS_API_URL` to the load balancer DNS.

GCP Cloud Run (CPU-only) or GCE (GPU) options
----------------------------------------------
- Cloud Run: good for CPU-only demos; deploy the container and set concurrency/memory.
- GCE: create a VM with GPU, pull the image, and run with Docker; expose port 8000.

Setting `KRONOS_API_URL` in Netlify/Vercel/Render
-------------------------------------------------
- Netlify: Site settings → Build & deploy → Environment → Add variable `KRONOS_API_URL`.
- Vercel: Project Settings → Environment Variables → Add `KRONOS_API_URL` for `Production`/`Preview`.
- Render: Service → Environment → Add `KRONOS_API_URL`.

Security
--------
- Protect the Kronos endpoint (use an API key, allowlist, or private network). If you expose it publicly, anyone can send requests which may incur costs.

If you want, I can:
- update the GitHub Actions workflow to push to Docker Hub or ECR instead of GHCR, or
- add a Render deployment manifest and a script to trigger deploy via Render API (requires API key), or
- prepare a GPU-enabled Dockerfile with instructions for installing the correct torch wheel for your CUDA version.
