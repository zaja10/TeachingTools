export interface Tool {
  id: string;
  title: string;
  category: string;
  path: string;
  component: string;
}

export const ToolRegistry: Tool[] = [
  {
    id: "breeders-equation",
    title: "Breeder's Equation Simulator",
    category: "Trial & Field Design",
    path: "/tools/breeders-equation",
    component: "breeders_equation/BreedersEquationView"
  },
  {
    id: "lmm-visualizer",
    title: "Linear Mixed Model Visualizer",
    category: "Trial Analysis",
    path: "/tools/lmm-visualizer",
    component: "lmm_visualizer/LmmVisualizerView"
  },
  {
    id: "hasse-designer",
    title: "Hasse Designer",
    category: "Trial & Field Design",
    path: "/tools/hasse-designer",
    component: "hasse_designer/HasseDesignerView"
  },
  {
    id: "net-merit-optimizer",
    title: "Net Merit Index Optimizer",
    category: "Selection Index Design",
    path: "/tools/net-merit-optimizer",
    component: "net_merit_optimizer/NetMeritOptimizerView"
  },
  {
    id: "open-index-gen",
    title: "Selection Index Generator",
    category: "Selection Index Design",
    path: "/tools/open-index-gen",
    component: "open_index_gen/OpenIndexGenView"
  },
  {
    id: "cross-performance",
    title: "Predicted Cross Performance",
    category: "Selection Index Design",
    path: "/tools/cross-performance",
    component: "cross_performance/CrossPerformanceView"
  },
  {
    id: "grmaker",
    title: "GRM Preparation (GRMaker)",
    category: "Trial Analysis",
    path: "/tools/grmaker",
    component: "grmaker/GRMakerApp"
  },
  {
    id: "plotmaker",
    title: "Exploratory Data Analysis (Plotmaker)",
    category: "Trial Analysis",
    path: "/tools/plotmaker",
    component: "plotmaker/PlotmakerApp"
  }
];
