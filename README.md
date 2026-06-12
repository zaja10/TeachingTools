# Quantitative Genetics Teaching Tools

Welcome to the **Quantitative Genetics Teaching Tools** suite! This repository houses a collection of interactive, web-based applications designed to assist plant breeders, quantitative geneticists, and students in exploring advanced genetic concepts, experimental designs, and selection strategies. 

The platform provides a highly visual, fast, and responsive way to generate matrices, design field trials, calculate selection indices, and visualize complex genetic models—all running directly in your browser.

![Build Status](https://img.shields.io/github/actions/workflow/status/jrutuiuc/crossselector/deploy.yml?branch=main)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-B73BFE?logo=vite&logoColor=FFD62E)

---

## 🛠️ Features & Tools

### 1. **Genomic Relationship Matrix (GRM) Maker**
A high-performance interactive tool to construct and visualize genomic relationship matrices (GRM). It calculates relatedness based on genetic marker data, providing heatmaps, interactive tuning parameters, and export functionality.
- Calculates covariance and relatedness structures in large-scale parent populations.
- Fully offloaded to Web Workers for smooth UI responsiveness during heavy matrix algebra.

### 2. **Cross Selector (Open Index Generator)**
Evaluate and predict cross performances. Define custom economic weights and selection indices, and instantly simulate how those weights shift your genetic gains.
- Ranks tens of thousands of potential cross combinations using phenotypic mid-parent values.
- Built-in **Pedigree Hasse Diagram Visualizer** to map out the lineage of top predicted crosses using `dagre` and `React Flow`.

### 3. **Hasse Designer & ANOVA Builder**
Map out complex crossing and nesting relationships (such as Split-Plot or RCBD designs) to automatically generate skeletal ANOVA tables.
- **Visual Builder:** Drag, drop, and nest factors (fixed vs random) visually to define your experimental structure.
- **Skeletal ANOVA:** Instantly converts the Hasse graph into appropriate Expected Mean Squares and degrees of freedom for accurate F-testing.

### 4. **Net Merit Optimizer**
Interactive visualization of the Breeder's Equation and Net Merit optimization. Drag data points on an N-Trait ellipse to dynamically re-calculate and shift selection pressure based on the breeder's desired outcomes.

### 5. **Field Trial Plot Maker**
Quickly design and randomize field trials. Set up rows, columns, and blocks, and allocate genotypes efficiently across your testing environments.

### 6. **Linear Mixed Models (LMM) Visualizer**
A teaching playground to understand Fixed vs. Random effects. Toggle factors and watch how variance components shift the Best Linear Unbiased Predictors (BLUPs) in real-time.

---

## 🚀 Getting Started

The platform is completely static and built with **Vite, React, and TypeScript**. There is no backend server required—all heavy computational lifting (like GRM matrix multiplication or cross generation) is executed in parallel background Web Workers within the browser.

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jrutuiuc/crossselector.git
   cd crossselector/frontend
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Run the Development Server:**
   ```bash
   npm run dev
   ```

4. **Build for Production:**
   ```bash
   npm run build
   ```

---

## 🎨 UI & Design System

The application is styled with a custom, uniform dashboard layout (`ToolLayoutWrapper`) utilizing the official **University of Illinois Urbana-Champaign (UIUC)** branding colors:
- **UIUC Navy:** `#13294b`
- **UIUC Illini Orange:** `#ff5f05`

The design features modern glassmorphism panels, interactive plotting (via Plotly.js), and seamless transitions for a premium, desktop-class experience.

---

## ⚙️ Automated Deployment

This project uses **GitHub Actions** for continuous deployment to GitHub Pages. Every push to the `main` branch automatically:
1. Runs strict TypeScript and ESLint validation (`npm run lint`).
2. Builds the production bundle (`npm run build`).
3. Deploys directly to the live GitHub Pages environment.

*(See `.github/workflows/deploy.yml` for the complete pipeline)*

---

## 🤝 Contributing

Contributions are welcome! If you're fixing bugs or adding new features (like new selection index strategies or visualization tools), please follow these guidelines:
- Ensure all heavy computations (matrices, iterative loops) are kept out of the main thread and properly wrapped in a Web Worker.
- Maintain strict TypeScript definitions (`any` should be avoided).
- Keep component styles isolated or use the provided shared classes in `index.css`.
- Ensure `npm run lint` and `npx vitest run` pass before pushing your code.

---

*Developed for educational and research advancement in quantitative genetics.*
