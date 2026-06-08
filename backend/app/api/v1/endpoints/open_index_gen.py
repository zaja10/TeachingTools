from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, validator
from typing import List, Optional
import pandas as pd
import numpy as np
from app.core.open_index_gen_engine import OpenIndexGenEngine

router = APIRouter()
engine = OpenIndexGenEngine()

DATASET_PATH = r"c:\Users\Zac\Documents\Antigravity\TeachingTools\Tested.parentSelectionFile07.09.2025.xlsx"

@router.get("/dataset/traits")
async def get_traits():
    try:
        df = pd.read_excel(DATASET_PATH, sheet_name=0)
        # Filter for numeric columns that are likely traits/BLUPs
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        # Exclude metadata-like columns
        exclude = ['Unnamed: 0', 'cohort']
        traits = [col for col in numeric_cols if col not in exclude]
        return {"traits": traits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class TraitList(BaseModel):
    traits: List[str]

@router.post("/dataset/matrix")
async def get_covariance_matrix(data: TraitList):
    try:
        df = pd.read_excel(DATASET_PATH, sheet_name=0)
        selected_df = df[data.traits].dropna()
        if selected_df.empty:
            raise ValueError("No data available for the selected traits after dropping NaNs.")
        cov_matrix = selected_df.cov().values.tolist()
        return {"covariance_matrix": cov_matrix, "traits": data.traits}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MatrixInput(BaseModel):
    method: str
    P: List[List[float]]
    G: List[List[float]]
    v: Optional[List[float]] = None
    restrict_idx: Optional[List[int]] = None
    delta: Optional[List[float]] = None
    alpha: Optional[float] = None
    alpha_proportion: Optional[float] = None
    cycles: Optional[int] = 0
    ellipse_axes: Optional[List[int]] = None

    @validator('method')
    def method_must_be_valid(cls, value):
        if value not in ['unrestricted', 'restricted', 'desired_gains', 'pure_desired_gains']:
            raise ValueError("Method must be 'unrestricted', 'restricted', 'desired_gains', or 'pure_desired_gains'")
        return value

class EllipseInput(BaseModel):
    G: List[List[float]]
    target_x: Optional[float] = None
    target_y: Optional[float] = None

@router.post("/ellipse_module")
def ellipse_module(inputs: EllipseInput):
    """
    GENUP Interactive Ellipse Module endpoint.
    If target_x and target_y are provided, reverse-engineers the weights.
    Otherwise, returns the ellipse boundary sweep.
    """
    G = np.array(inputs.G)
    
    if inputs.target_x is not None and inputs.target_y is not None:
        return OpenIndexGenEngine.reverse_genup_ellipse(G, inputs.target_x, inputs.target_y)
    else:
        return OpenIndexGenEngine.generate_genup_ellipse(G)

@router.post("/simulate")
async def simulate_index(data: MatrixInput):
    inputs = data.dict()
    result = engine.simulate(inputs)
    
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
        
    return result
