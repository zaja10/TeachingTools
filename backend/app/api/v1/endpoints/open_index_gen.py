from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, validator
from typing import List, Optional
from app.core.open_index_gen_engine import OpenIndexGenEngine

router = APIRouter()
engine = OpenIndexGenEngine()

class MatrixInput(BaseModel):
    method: str
    P: List[List[float]]
    G: List[List[float]]
    v: Optional[List[float]] = None
    restrict_idx: Optional[List[int]] = None
    delta: Optional[List[float]] = None
    alpha: Optional[float] = None

    @validator('method')
    def method_must_be_valid(cls, value):
        if value not in ['unrestricted', 'restricted', 'desired_gains', 'pure_desired_gains']:
            raise ValueError("Method must be 'unrestricted', 'restricted', 'desired_gains', or 'pure_desired_gains'")
        return value

@router.post("/simulate")
async def simulate_index(data: MatrixInput):
    inputs = data.dict()
    result = engine.simulate(inputs)
    
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
        
    return result
