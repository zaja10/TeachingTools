from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints import spatial_strata, breeders_equation, lmm_visualizer

app = FastAPI(
    title="Multi-Tool EdTech Hub",
    description="API Gateway for Quantitative Genetics Tools",
    version="1.0.0",
)

# CORS Middleware for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include isolated router endpoints
app.include_router(spatial_strata.router, prefix="/api/v1/tools/spatial_strata", tags=["Spatial Strata"])
app.include_router(breeders_equation.router, prefix="/api/v1/tools/breeders_equation", tags=["Breeder's Equation"])
app.include_router(lmm_visualizer.router, prefix="/api/v1/tools/lmm_visualizer", tags=["LMM Visualizer"])

# Commented out until these are implemented:
# app.include_router(population_structure.router, prefix="/api/v1/tools/population_structure", tags=["Population Structure"])
# app.include_router(genomic_selection.router, prefix="/api/v1/tools/genomic_selection", tags=["Genomic Selection"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the EdTech Hub API Gateway"}
