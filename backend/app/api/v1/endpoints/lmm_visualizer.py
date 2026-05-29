from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any, List
from app.core.engine_base import TeachingEngine
from app.core.lmm_data_generator import generate_lmm_data

router = APIRouter()

class LmmVisualizerEngine(TeachingEngine):
    def simulate(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        # Returns the synthetic dataset and the precalculated model fits
        data = generate_lmm_data()
        return {"status": "success", "data": data}
        
    def evaluate(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "success", "message": "Not applicable."}

engine = LmmVisualizerEngine()

class SimulationRequest(BaseModel):
    inputs: Dict[str, Any]

@router.post("/simulate")
async def run_simulation(request: SimulationRequest):
    result = engine.simulate(request.inputs)
    return result

@router.get("/data")
async def get_data():
    return engine.simulate({})
