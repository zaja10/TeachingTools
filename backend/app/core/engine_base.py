from abc import ABC, abstractmethod
from typing import Any, Dict

class TeachingEngine(ABC):
    """
    The Strategy Pattern Base Class for all teaching engines.
    Every tool backend must implement `.simulate()` and `.evaluate()`.
    """
    
    @abstractmethod
    def simulate(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the simulation based on user inputs.
        Should return the computation response as a dictionary.
        """
        pass
        
    @abstractmethod
    def evaluate(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluates a user's answer or performance.
        """
        pass
