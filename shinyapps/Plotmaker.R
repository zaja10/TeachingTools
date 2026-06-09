# Load necessary libraries
# Make sure you have these installed:
# install.packages(c("shiny", "DT", "bslib", "ggplot2", "plotly", "dplyr", "shinycssloaders", "corrplot", "GGally", "shinyjs", "memoise", "rmarkdown", "readxl", "nortest", "tinytex")) # Added tinytex
library(shiny)
library(DT)
library(bslib)           # For theming and modern UI components
library(ggplot2)         # For plotting
library(plotly)          # For interactive plots
library(dplyr)           # For data manipulation
library(shinycssloaders) # For loading spinners
library(corrplot)        # For correlation plots
library(GGally)          # For ggpairs correlation plots
library(shinyjs)         # For advanced JavaScript operations
library(memoise)         # For caching function results
library(rmarkdown)       # For report generation
library(readxl)          # For reading Excel files
library(nortest)         # For alternative normality tests like ad.test
library(tinytex)         # For checking LaTeX installation

# Helper function for transformations
# Applies log1p or sqrt transformation to a numeric vector, handling potential issues.
apply_transform <- function(x, transform_type) {
  # Return non-numeric columns as is
  if (!is.numeric(x)) return(x)
  
  transformed_x <- switch(
    transform_type,
    "None" = x,
    "Log (log1p)" = log1p(x), # log1p(y) = log(1+y), handles zeros safely
    "Sqrt" = {
      # Handle negative numbers for sqrt - replace with NA
      if (any(x < 0, na.rm = TRUE)) {
        # Use shiny::validate or showNotification in server logic instead of warning() for better user feedback
        warning("Negative values found for Sqrt transformation; replaced with NA.")
        x[x < 0] <- NA
      }
      sqrt(x)
    },
    x # Default: return original if transform_type is not matched
  )
  return(transformed_x)
}

# Helper function for base R correlation plot using corrplot
create_correlation_plot <- function(data, method = "pearson", sig.level = 0.05) {
  # Ensure there are at least two columns
  if (ncol(data) < 2) {
    shiny::validate("Need at least two numeric columns for correlation plot.")
    return(NULL)
  }
  
  # Calculate correlation matrix using pairwise complete observations
  cor_matrix <- cor(data, use = "pairwise.complete.obs", method = method)
  
  # Function to safely calculate p-values for correlation tests
  cor_test_safe <- function(x, y, method) {
    valid_indices <- !is.na(x) & !is.na(y)
    x_valid <- x[valid_indices]
    y_valid <- y[valid_indices]
    if (length(x_valid) < 3 || length(y_valid) < 3) return(1)
    sd_x <- sd(x_valid, na.rm = TRUE); sd_y <- sd(y_valid, na.rm = TRUE)
    if (is.na(sd_x) || sd_x == 0 || is.na(sd_y) || sd_y == 0) return(1)
    result <- tryCatch(
      cor.test(x_valid, y_valid, method = method)$p.value,
      error = function(e) 1
    )
    return(result)
  }
  
  # Create p-value matrix
  p_matrix <- matrix(NA, nrow = ncol(data), ncol = ncol(data))
  colnames(p_matrix) <- colnames(data)
  rownames(p_matrix) <- colnames(data)
  for (i in 1:ncol(data)) {
    for (j in 1:ncol(data)) {
      if (i == j) {
        p_matrix[i, j] <- 0
      } else {
        p_matrix[i, j] <- cor_test_safe(data[, i], data[, j], method = method)
      }
    }
  }
  
  # Generate the corrplot visualization
  corrplot(cor_matrix,
           method = "circle", type = "upper", order = "hclust",
           tl.col = "black", tl.srt = 45,
           p.mat = p_matrix, sig.level = sig.level, insig = "blank",
           diag = FALSE, addCoef.col = "black",
           number.cex = 0.8 # Increased text size
  )
  
  # Return calculated matrices along with plot type info
  # This allows the matrices to be stored for the report
  return(invisible(list(type = "corrplot", cor_matrix = cor_matrix, p_matrix = p_matrix, method = method, sig.level = sig.level)))
}

# --- Memoised Functions ---
# Cache results of expensive operations
calculate_cor_matrix_memoised <- memoise(function(data, method) {
  data_df <- as.data.frame(data)
  numeric_cols <- sapply(data_df, is.numeric)
  if (sum(numeric_cols) < 2) {
    warning("Need at least two numeric columns for correlation matrix.")
    return(NULL)
  }
  cor(data_df[, numeric_cols, drop = FALSE], use = "pairwise.complete.obs", method = method)
})
calculate_p_matrix_memoised <- memoise(function(data, method) {
  data_df <- as.data.frame(data)
  numeric_cols <- sapply(data_df, is.numeric)
  if (sum(numeric_cols) < 2) {
    warning("Need at least two numeric columns for p-value matrix.")
    return(NULL)
  }
  data_numeric <- data_df[, numeric_cols, drop = FALSE]
  
  cor_test_safe <- function(x, y, method) {
    valid_indices <- !is.na(x) & !is.na(y)
    x_valid <- x[valid_indices]; y_valid <- y[valid_indices]
    if (length(x_valid) < 3 || length(y_valid) < 3) return(1)
    sd_x <- sd(x_valid, na.rm = TRUE); sd_y <- sd(y_valid, na.rm = TRUE)
    if (is.na(sd_x) || sd_x == 0 || is.na(sd_y) || sd_y == 0) return(1)
    result <- tryCatch(cor.test(x_valid, y_valid, method = method)$p.value, error = function(e) 1)
    return(result)
  }
  p_matrix <- matrix(NA, nrow = ncol(data_numeric), ncol = ncol(data_numeric))
  colnames(p_matrix) <- colnames(data_numeric); rownames(p_matrix) <- colnames(data_numeric)
  for (i in 1:ncol(data_numeric)) {
    for (j in 1:ncol(data_numeric)) {
      if (i == j) p_matrix[i, j] <- 0
      else p_matrix[i, j] <- cor_test_safe(data_numeric[, i], data_numeric[, j], method = method)
    }
  }
  return(p_matrix)
})
anova_test_memoised <- memoise(function(formula, data) {
  if (!inherits(formula, "formula")) formula <- as.formula(formula)
  aov(formula, data = data, na.action = na.omit)
})
t_test_memoised <- memoise(function(formula, data) {
  if (!inherits(formula, "formula")) formula <- as.formula(formula)
  t.test(formula, data = data, na.action = na.omit)
})
prcomp_memoised <- memoise(function(data, scale.) {
  # Ensure data is numeric matrix or data frame for prcomp
  data_numeric <- data[, sapply(data, is.numeric), drop = FALSE]
  # No need for validate here, let prcomp handle errors if needed
  # validate(need(ncol(data_numeric) >= 2, "Need at least 2 numeric columns for PCA calculation."))
  prcomp(data_numeric, scale. = scale.)
})

# Helper function to generate R Markdown content (Revised for PCA Plot Regen)
generate_rmd_content <- function(params) {
  # Sanitize data name for LaTeX
  safe_data_name <- params$data_name
  chars_to_escape <- c("&", "%", "$", "#", "_", "{", "}", "~", "^", "\\")
  for (char in chars_to_escape) {
    safe_data_name <- gsub(char, paste0("\\", char), safe_data_name, fixed = TRUE)
  }
  
  # Rmd template string
  rmd_content <- paste0('
---
title: "Exploratory Data Analysis Report"
date: "`r Sys.Date()`"
output:
  pdf_document:
    toc: true
    toc_depth: 3
params:
  data_name: "', safe_data_name, '"
  processed_data_summary: NA
  hist_plot: NA
  scatter_plot: NA
  box_plot: NA
  corr_plot_cor_matrix: NA
  corr_plot_p_matrix: NA
  corr_plot_sig_level: NA
  ggpairs_plot: NA
  pca_result_obj: NA # Pass the prcomp object
  pca_x_axis: "PC1" # Default X axis
  pca_y_axis: "PC2" # Default Y axis
---

```{r setup, include=FALSE}
knitr::opts_chunk$set(echo = FALSE, warning = FALSE, message = FALSE, fig.width = 6.5, fig.height = 5)
library(ggplot2)
library(dplyr)
library(corrplot)
library(GGally)
options(scipen=999, knitr.kable.NA = "")
```

# Introduction

This report summarizes the exploratory data analysis performed on the dataset: **`r params$data_name`**.
Analysis was performed on processed data after subsetting and NA handling.

# Data Overview

## Processed Data Summary

```{r data_summary}
if (!is.null(params$processed_data_summary) && inherits(params$processed_data_summary, "summaryDefault")) {
  print(params$processed_data_summary)
} else {
  cat("Summary statistics could not be generated or passed to the report.")
}
```

# Univariate Analysis: Histogram

```{r histogram_plot, fig.cap="Histogram of selected variable."}
if (!is.null(params$hist_plot) && inherits(params$hist_plot, "ggplot")) {
  print(params$hist_plot)
} else {
  cat("Histogram plot was not generated or passed to the report.")
}
```

# Bivariate Analysis: Scatter Plot

```{r scatter_plot, fig.cap="Scatter plot of selected variables."}
if (!is.null(params$scatter_plot) && inherits(params$scatter_plot, "ggplot")) {
  print(params$scatter_plot)
} else {
  cat("Scatter plot was not generated or passed to the report.")
}
```

# Group Comparison: Box Plot

```{r box_plot, fig.cap="Box plot comparing groups."}
if (!is.null(params$box_plot) && inherits(params$box_plot, "ggplot")) {
  print(params$box_plot)
} else {
  cat("Box plot was not generated or passed to the report.")
}
```

# Correlation Analysis

```{r correlation_plot, fig.cap="Correlation plot."}
if (!is.null(params$ggpairs_plot) && inherits(params$ggpairs_plot, "gg")) {
   print(params$ggpairs_plot)
} else if (!is.null(params$corr_plot_cor_matrix) && !is.null(params$corr_plot_p_matrix)) {
  tryCatch({
      corrplot::corrplot(params$corr_plot_cor_matrix,
                         method = "circle", type = "upper", order = "hclust",
                         tl.col = "black", tl.srt = 45,
                         p.mat = params$corr_plot_p_matrix,
                         sig.level = params$corr_plot_sig_level %||% 0.05,
                         insig = "blank", diag = FALSE,
                         addCoef.col = "black", number.cex = 0.8)
  }, error = function(e) { cat("Could not generate corrplot from provided matrices.") })
} else {
  cat("Correlation plot was not generated or parameters were not available.")
}
```

# Principal Component Analysis (PCA)

## PCA Summary

```{r pca_summary_report}
# **FIX**: Use the passed pca_result_obj to generate summary
if (!is.null(params$pca_result_obj) && inherits(params$pca_result_obj, "prcomp")) {
  print(summary(params$pca_result_obj))
} else {
  cat("PCA Summary was not generated or passed to the report.")
}
```

## PCA Biplot

```{r pca_plot_report, fig.cap="PCA Biplot."}
# **FIX**: Regenerate biplot using passed parameters
if (!is.null(params$pca_result_obj) && inherits(params$pca_result_obj, "prcomp")) {
  pca_res <- params$pca_result_obj
  x_axis_name <- params$pca_x_axis %||% "PC1" # Use default if not passed
  y_axis_name <- params$pca_y_axis %||% "PC2" # Use default if not passed
  n_pcs_avail <- ncol(pca_res$x)
  x_idx <- as.numeric(gsub("PC", "", x_axis_name))
  y_idx <- as.numeric(gsub("PC", "", y_axis_name))

  # Basic validation within Rmd chunk
  if (x_idx <= n_pcs_avail && y_idx <= n_pcs_avail && x_idx != y_idx) {
      tryCatch({
          biplot(pca_res, choices = c(x_idx, y_idx),
                 cex = c(0.7, 0.8), scale = 0,
                 main = paste("PCA Biplot (", x_axis_name, "vs", y_axis_name, ")"))
      }, error = function(e){
          cat("Error generating PCA biplot:", e$message)
      })
  } else {
      cat("Invalid PCA axes selected or PCA result insufficient for biplot.")
  }
} else {
  cat("PCA Biplot could not be generated (PCA result not available).")
}
```
') # End of Rmd content string
  
  return(rmd_content)
}


# Define the User Interface (UI) using bslib::page_sidebar
ui <- page_sidebar(
  useShinyjs(), # Initialize shinyjs
  
  # Set a default theme (can be any bootswatch theme)
  theme = bs_theme(version = 5, bootswatch = "cosmo"),
  
  # Title
  title = "Enhanced Exploratory Data Analysis App",
  
  # Sidebar panel configuration
  sidebar = sidebar(
    width = 300,
    # Data Upload Section as a Card
    card(
      card_header("Data Upload"),
      fileInput("file1", "Choose CSV or Excel File",
                multiple = FALSE,
                accept = c("text/csv", "text/comma-separated-values,text/plain", ".csv",
                           "application/vnd.ms-excel", ".xls",
                           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx")),
      checkboxInput("header", "Header", TRUE),
      radioButtons("sep", "Separator (CSV only)", choices = c(Comma = ",", Semicolon = ";", Tab = "\t"), selected = ","),
      radioButtons("quote", "Quote (CSV only)", choices = c(None = "", "Double Quote" = '"', "Single Quote" = "'"), selected = '"')
    ),
    
    # Data Preparation Section (Column Subsetting)
    card(
      card_header("Data Preparation"),
      uiOutput("subset_cols_selector") # Dynamic UI for column selection
    ),
    
    # Downloads Section
    card(
      card_header("Downloads"),
      downloadButton("downloadData", "Download Processed Data (CSV)", class = "btn-sm mb-2 w-100"),
      downloadButton("downloadPlotHist", "Download Histogram (PNG)", class = "btn-sm mb-2 w-100"),
      downloadButton("downloadPlotScatter", "Download Scatter Plot (PNG)", class = "btn-sm mb-2 w-100"),
      downloadButton("downloadPlotBox", "Download Box Plot (PNG)", class = "btn-sm mb-2 w-100"),
      downloadButton("downloadPlotCorr", "Download Correlation Plot (PNG)", class = "btn-sm mb-2 w-100"),
      downloadButton("downloadPlotPCA", "Download PCA Biplot (PNG)", class = "btn-sm mb-2 w-100"),
      hr(),
      downloadButton("downloadReport", "Generate Analysis Report (PDF)", class = "btn-primary w-100")
    )
  ),
  
  # Main panel layout using navset_card_tab
  navset_card_tab(
    id = "main_analysis_tabs",
    # Data Preprocessing Tab
    nav_panel(
      "Data Preprocessing", value = "preprocess_tab",
      layout_columns(
        col_widths = c(6, 6),
        card(card_header("Missing Values (Original Data)"), verbatimTextOutput("missing_summary") %>% withSpinner()),
        card(card_header("Data Cleaning Actions"),
             selectInput("na_action", "Handle Missing Values in Processed Data:",
                         choices = c("Keep NAs" = "none", "Remove rows with any NA" = "na.omit",
                                     "Replace numeric NAs with mean" = "mean_impute", "Replace numeric NAs with median" = "median_impute")),
             actionButton("apply_na_action", "Apply Action to Processed Data", class = "btn-primary w-100"),
             hr(), verbatimTextOutput("cleaning_summary")
        )
      )
    ),
    # Data Structure Tab
    nav_panel("Structure", value = "structure_tab", card(card_header("Data Structure"), verbatimTextOutput("structure") %>% withSpinner())),
    # Summary Statistics Tab
    nav_panel("Summary", value = "summary_tab", card(card_header("Summary Statistics"), verbatimTextOutput("summary") %>% withSpinner())),
    # Normality Test Tab
    nav_panel("Normality Test", value = "normality_tab",
              card(card_header("Normality Test Settings"),
                   uiOutput("norm_var_selector"), hr(),
                   selectInput("norm_transform", "Transform Variable:", choices = c("None", "Log (log1p)", "Sqrt"), selected = "None", width = "50%")
              ),
              card(card_header("Normality Test Results"),
                   verbatimTextOutput("normality_test_results") %>% withSpinner()
              )
    ),
    # Histogram Tab
    nav_panel("Histogram", value = "histogram_tab",
              card(card_header("Histogram Settings"),
                   uiOutput("hist_var_selector"), hr(),
                   layout_columns(col_widths = c(6, 6),
                                  numericInput("hist_bins", "Number of Bins:", value = 30, min = 1, step = 1),
                                  selectInput("hist_transform", "Transform Variable:", choices = c("None", "Log (log1p)", "Sqrt"), selected = "None")),
                   checkboxInput("density_overlay", "Overlay Density Curve?", FALSE)
              ),
              card(card_header("Histogram Plot"), plotlyOutput("histogram", height = "500px") %>% withSpinner())
    ),
    # Scatter Plot Tab
    nav_panel("Scatter Plot", value = "scatter_tab",
              card(card_header("Scatter Plot Settings"),
                   layout_columns(col_widths = c(6, 6), uiOutput("scatter_var_selector_x"), uiOutput("scatter_var_selector_y")), hr(),
                   layout_columns(col_widths = c(6, 6),
                                  selectInput("scatter_x_transform", "Transform X Variable:", choices = c("None", "Log (log1p)", "Sqrt"), selected = "None"),
                                  selectInput("scatter_y_transform", "Transform Y Variable:", choices = c("None", "Log (log1p)", "Sqrt"), selected = "None"))
              ),
              card(card_header("Scatter Plot"), plotlyOutput("scatterPlot", height = "500px") %>% withSpinner()),
              # Accordion for LM Summary
              accordion(
                id = "scatter_stats_accordion", open = FALSE, # Start closed
                accordion_panel("Linear Model Summary", verbatimTextOutput("lm_summary_results") %>% withSpinner())
              )
    ),
    # Box Plot Tab
    nav_panel("Box Plot", value = "boxplot_tab",
              card(card_header("Box Plot Settings"),
                   layout_columns(col_widths = c(6, 6), uiOutput("boxplot_var_selector_cat"), uiOutput("boxplot_var_selector_num")), hr(),
                   selectInput("boxplot_num_transform", "Transform Value Variable:", choices = c("None", "Log (log1p)", "Sqrt"), selected = "None", width = "50%")
              ),
              card(card_header("Box Plot"), plotlyOutput("boxPlot", height = "500px") %>% withSpinner()),
              # Accordion for Stats Tests
              accordion(
                id = "boxplot_stats_accordion", open = FALSE, # Start closed
                accordion_panel("Statistical Tests (ANOVA / t-test / Post-Hoc)",
                                verbatimTextOutput("anova_ttest_results") %>% withSpinner(),
                                verbatimTextOutput("posthoc_results") %>% withSpinner()
                )
              )
    ),
    # Correlation Tab
    nav_panel("Correlation", value = "correlation_tab",
              card(card_header("Correlation Settings"),
                   uiOutput("correlation_vars_selector"), hr(),
                   layout_columns(col_widths = c(4, 4, 4),
                                  selectInput("cor_method", "Method:", choices = c("Pearson" = "pearson", "Spearman" = "spearman", "Kendall" = "kendall"), selected = "pearson"),
                                  numericInput("cor_sig_level", "Sig. Level:", value = 0.05, min = 0.001, max = 0.1, step = 0.001),
                                  checkboxInput("use_ggpairs", "Use GGPairs Plot?", FALSE))
              ),
              card(card_header("Correlation Plot"), plotOutput("correlationPlot", height = "600px") %>% withSpinner())
    ),
    # PCA Analysis Tab
    nav_panel("PCA Analysis", value = "pca_tab",
              card(card_header("PCA Settings"),
                   layout_columns(col_widths = c(4, 4, 4), # Use 3 columns
                                  selectInput("pca_scale", "Scale Variables:", choices = c("Yes" = TRUE, "No" = FALSE), selected = TRUE),
                                  uiOutput("pca_x_axis_selector"),
                                  uiOutput("pca_y_axis_selector")
                   ),
                   hr(), # Add separator
                   actionButton("run_pca", "Run PCA Analysis", class = "btn-primary w-100") # Add Run button
              ),
              card(card_header("PCA Results"),
                   plotOutput("pca_biplot", height = "500px") %>% withSpinner(), hr(),
                   # Accordion for PCA Summary
                   accordion(
                     id = "pca_summary_accordion", open = FALSE, # Start closed
                     accordion_panel("PCA Summary Details", verbatimTextOutput("pca_summary") %>% withSpinner())
                   )
              )
    ),
    # Data Table Tab
    nav_panel("Data", value = "data_tab", card(card_header("Processed Data Table"), DT::dataTableOutput("contents") %>% withSpinner())),
    # Help/About Tab
    nav_panel("Help/About", value = "help_tab", card(card_header("About This App"), # Content remains the same...
                                                     p("This application performs exploratory data analysis (EDA) on uploaded CSV or Excel files."),
                                                     p("Key Features:"),
                                                     tags$ul(
                                                       tags$li("Data upload (CSV, XLS, XLSX) and parsing options."),
                                                       tags$li("Column subsetting for analysis focus."),
                                                       tags$li("Data preprocessing step for handling missing values."),
                                                       tags$li("Caching of computationally intensive operations using", code("memoise"), "."),
                                                       tags$li("Viewing data structure and summary statistics."),
                                                       tags$li("Applying Log or Square Root transformations."),
                                                       tags$li("Normality testing (Shapiro-Wilk with sampling for large data)."),
                                                       tags$li("Interactive histograms, scatter plots (with sampling for large data), and box plots (plotly)."),
                                                       tags$li("T-tests / ANOVA with post-hoc tests."),
                                                       tags$li("Correlation analysis (corrplot / ggpairs)."),
                                                       tags$li("Principal Component Analysis (PCA) with selectable axes for biplot."),
                                                       tags$li("Interactive data table browsing."),
                                                       tags$li("Collapsible sections for statistical outputs."),
                                                       tags$li("Downloading processed data and plots."),
                                                       tags$li("Generating downloadable PDF analysis reports using", code("rmarkdown"), ".")
                                                     ),
                                                     h4("How to Use"),
                                                     tags$ol(
                                                       tags$li("Upload a CSV or Excel file ('Data Upload')."),
                                                       tags$li("Adjust parsing options if needed."),
                                                       tags$li("Select columns for analysis ('Data Preparation')."),
                                                       tags$li("Handle missing values if needed ('Data Preprocessing')."),
                                                       tags$li("Navigate through analysis tabs."),
                                                       tags$li("Select variables and adjust settings within each analysis tab."),
                                                       tags$li("For PCA, click 'Run PCA Analysis' after selecting options."), # Added instruction
                                                       tags$li("View results and plots. Expand accordion sections for statistical details where available."),
                                                       tags$li("Download outputs or generate a PDF report ('Downloads').")
                                                     ),
                                                     h4("Libraries Used"),
                                                     p("shiny, DT, bslib, ggplot2, plotly, dplyr, shinycssloaders, corrplot, GGally, shinyjs, memoise, rmarkdown, readxl, nortest, tinytex.")
    )
    )
  )
)


# Define the Server logic
server <- function(input, output, session) {
  
  # --- Reactive Values ---
  rv <- reactiveValues(
    original_data = NULL, subsetted_data = NULL, processed_data = NULL,
    cleaning_log = "No cleaning actions applied yet.",
    gg_hist = NULL, gg_scatter = NULL, gg_box = NULL,
    corr_plot_obj = NULL, # Holds ggpairs object OR list(type="corrplot", cor_matrix=..., p_matrix=..., sig.level=...)
    pca_result_obj = NULL, # Stored PCA result (prcomp object)
    pca_plot = NULL      # Stored PCA plot (recordedplot object)
  )
  
  # --- Data Input and Initial Processing ---
  # 1. Read Original Data (Handles CSV and Excel)
  observeEvent(input$file1, {
    req(input$file1); file_path <- input$file1$datapath; file_name <- input$file1$name; file_ext <- tolower(tools::file_ext(file_name))
    read_func <- switch(file_ext,
                        "csv" = function(path) read.csv(path, header = input$header, sep = input$sep, quote = input$quote, stringsAsFactors = TRUE),
                        "xls" = function(path) readxl::read_excel(path, sheet = 1),
                        "xlsx" = function(path) readxl::read_excel(path, sheet = 1), NULL)
    if (is.null(read_func)) { showNotification(paste("Unsupported file type:", file_ext), type = "error"); return() }
    tryCatch({
      df <- read_func(file_path)
      # Apply make.names immediately after reading
      names(df) <- make.names(names(df), unique = TRUE)
      df[] <- lapply(df, function(col) if(is.character(col)) as.factor(col) else col)
      if (!".row_id" %in% names(df)) { df <- df %>% mutate(.row_id = row_number()) }
      rv$original_data <- df; rv$subsetted_data <- df; rv$processed_data <- df
      rv$cleaning_log <- "Data loaded. No cleaning actions applied yet."; rv$pca_result_obj <- NULL; rv$pca_plot <- NULL # Reset PCA
      updateSelectizeInput(session, "subset_cols", selected = setdiff(names(df), ".row_id"))
      if (file_ext %in% c("xls", "xlsx")) { showNotification("Excel file loaded (first sheet).", type = "message") }
    }, error = function(e) { showNotification(paste("Error reading file:", e$message), type = "error"); rv$original_data <- NULL; rv$subsetted_data <- NULL; rv$processed_data <- NULL; rv$pca_result_obj <- NULL; rv$pca_plot <- NULL; rv$cleaning_log <- "Error loading data." })
  })
  
  # 2. Dynamic UI for Column Subsetting
  output$subset_cols_selector <- renderUI({
    df_orig <- rv$original_data; req(df_orig)
    cols_to_offer <- setdiff(names(df_orig), ".row_id")
    selectizeInput("subset_cols", "Select Columns for Analysis:", choices = cols_to_offer,
                   selected = isolate(input$subset_cols) %||% cols_to_offer,
                   multiple = TRUE, options = list(plugins = list('remove_button')))
  })
  
  # 3. Update Subsetted Data when Column Selection Changes
  observe({
    df_orig <- rv$original_data; selected_cols <- input$subset_cols; req(df_orig)
    if (is.null(selected_cols) || length(selected_cols) == 0) { rv$subsetted_data <- df_orig %>% select(any_of(".row_id")); if (!is.null(isolate(input$subset_cols))) showNotification("No columns selected.", type = "warning")
    } else { cols_to_keep <- intersect(c(".row_id", selected_cols), names(df_orig)); rv$subsetted_data <- df_orig %>% select(all_of(cols_to_keep)) }
    if (!identical(isolate(rv$processed_data), rv$subsetted_data)) { rv$processed_data <- rv$subsetted_data; rv$cleaning_log <- "Columns updated. No cleaning applied."; rv$pca_result_obj <- NULL; rv$pca_plot <- NULL; updateSelectInput(session, "na_action", selected = "none") }
  }) |> bindEvent(input$subset_cols, rv$original_data)
  
  # --- Data Preprocessing Logic ---
  # 4. Missing Value Summary
  output$missing_summary <- renderPrint({ df_orig <- rv$original_data; validate(need(!is.null(df_orig), "Upload data.")); cat("Missing Value Summary (Original Data):\n\n"); missing_counts <- sapply(df_orig, function(x) sum(is.na(x))); missing_pct <- sapply(df_orig, function(x) round(mean(is.na(x)) * 100, 2)); valid_cols <- setdiff(names(df_orig), ".row_id"); missing_df <- data.frame(Column = valid_cols, Missing_Count = missing_counts[valid_cols], Missing_Percent = missing_pct[valid_cols]); row.names(missing_df) <- NULL; missing_df_filtered <- missing_df[missing_df$Missing_Count > 0, ]; if(nrow(missing_df_filtered) == 0) { cat("No missing values found.\n") } else { print(missing_df_filtered, row.names = FALSE) } })
  # 5. Apply NA Handling Action
  observeEvent(input$apply_na_action, { df_sub <- rv$subsetted_data; na_action <- input$na_action; validate(need(!is.null(df_sub), "Upload/select columns.")); original_rows <- nrow(df_sub); original_cols <- ncol(df_sub); processed_df <- NULL; log_msg <- ""; if (na_action == "none") { processed_df <- df_sub; log_msg <- paste("NA Action: Kept NAs.", Sys.time()); showNotification("Processed data reset.", type = "message") } else if (na_action == "na.omit") { processed_df <- na.omit(df_sub); removed_rows <- original_rows - nrow(processed_df); log_msg <- paste("NA Action: Removed", removed_rows, "rows.", Sys.time()); showNotification(paste("Removed", removed_rows, "rows."), type = "message") } else if (na_action %in% c("mean_impute", "median_impute")) { df_temp <- df_sub; impute_func <- if (na_action == "mean_impute") mean else median; imputed_cols_count <- 0; for (col_name in names(df_temp)) { if (is.numeric(df_temp[[col_name]]) && col_name != ".row_id" && any(is.na(df_temp[[col_name]]))) { col_data <- df_temp[[col_name]]; impute_value <- impute_func(col_data, na.rm = TRUE); if (is.finite(impute_value)) { df_temp[[col_name]][is.na(col_data)] <- impute_value; imputed_cols_count <- imputed_cols_count + 1 } else { showNotification(paste("Cannot impute", col_name), type = "warning") } } }; processed_df <- df_temp; action_label <- if (na_action == "mean_impute") "mean" else "median"; log_msg <- paste("NA Action: Imputed", imputed_cols_count, "cols using", action_label, ".", Sys.time()); showNotification(paste("Imputed NAs using column", action_label), type = "message") }; rv$processed_data <- processed_df; rv$pca_result_obj <- NULL; rv$pca_plot <- NULL; processed_rows <- nrow(rv$processed_data); processed_cols <- ncol(rv$processed_data); rv$cleaning_log <- paste(log_msg, sprintf("\nOrig dims: %d x %d", original_rows, (original_cols-1)), sprintf("\nProc dims: %d x %d", processed_rows, (processed_cols-1))) })
  # 6. Cleaning Summary Output
  output$cleaning_summary <- renderText({ rv$cleaning_log })
  
  # --- Dynamic UI Selectors (Rendered in Server, Placed in UI Tabs) ---
  get_processed_data_cols <- reactive({ df <- rv$processed_data; validate(need(!is.null(df) && ncol(df) > 1, "Waiting for processed data...")); return(df) }) |> bindCache(rv$processed_data)
  output$hist_var_selector <- renderUI({ df <- get_processed_data_cols(); numeric_cols <- setdiff(names(df)[sapply(df, is.numeric)], ".row_id"); validate(need(length(numeric_cols) > 0, "No numeric columns.")); selectInput("hist_var", "Select Variable:", choices = numeric_cols, selected = isolate(input$hist_var) %||% numeric_cols[1]) })
  output$scatter_var_selector_x <- renderUI({ df <- get_processed_data_cols(); numeric_cols <- setdiff(names(df)[sapply(df, is.numeric)], ".row_id"); validate(need(length(numeric_cols) > 0, "No numeric columns.")); selectInput("scatter_var_x", "Select X Variable:", choices = numeric_cols, selected = isolate(input$scatter_var_x) %||% numeric_cols[1]) })
  output$scatter_var_selector_y <- renderUI({ df <- get_processed_data_cols(); numeric_cols <- setdiff(names(df)[sapply(df, is.numeric)], ".row_id"); validate(need(length(numeric_cols) > 1, "Need >= 2 numeric columns.")); current_x <- isolate(input$scatter_var_x); available_y <- setdiff(numeric_cols, current_x); selected_y <- isolate(input$scatter_var_y); if(is.null(selected_y) || !selected_y %in% available_y) { selected_y <- if(length(available_y) > 0) available_y[1] else numeric_cols[1] }; selectInput("scatter_var_y", "Select Y Variable:", choices = numeric_cols, selected = selected_y) })
  output$boxplot_var_selector_cat <- renderUI({ df <- get_processed_data_cols(); categorical_cols <- names(df)[sapply(df, function(col) is.factor(col) || is.character(col))]; validate(need(length(categorical_cols) > 0, "No categorical columns.")); selectInput("boxplot_var_cat", "Select Grouping Variable:", choices = categorical_cols, selected = isolate(input$boxplot_var_cat) %||% categorical_cols[1]) })
  output$boxplot_var_selector_num <- renderUI({ df <- get_processed_data_cols(); numeric_cols <- setdiff(names(df)[sapply(df, is.numeric)], ".row_id"); validate(need(length(numeric_cols) > 0, "No numeric columns.")); selectInput("boxplot_var_num", "Select Value Variable:", choices = numeric_cols, selected = isolate(input$boxplot_var_num) %||% numeric_cols[1]) })
  output$norm_var_selector <- renderUI({ df <- get_processed_data_cols(); numeric_cols <- setdiff(names(df)[sapply(df, is.numeric)], ".row_id"); validate(need(length(numeric_cols) > 0, "No numeric columns.")); selectInput("norm_var", "Select Variable:", choices = numeric_cols, selected = isolate(input$norm_var) %||% numeric_cols[1]) })
  output$correlation_vars_selector <- renderUI({ df <- get_processed_data_cols(); numeric_cols <- setdiff(names(df)[sapply(df, is.numeric)], ".row_id"); validate(need(length(numeric_cols) >= 2, "Need >= 2 numeric columns.")); selectizeInput("correlation_vars", "Select Numeric Variables (2+):", choices = numeric_cols, selected = isolate(input$correlation_vars) %||% numeric_cols, multiple = TRUE, options = list(plugins = list('remove_button'))) })
  # PCA Axis Selectors (depend on pca_results_reactive)
  output$pca_x_axis_selector <- renderUI({
    pca_res <- rv$pca_result_obj # Use the stored result object
    validate(need(!is.null(pca_res) && inherits(pca_res, "prcomp"), "Run PCA first."))
    n_pcs <- ncol(pca_res$x)
    validate(need(n_pcs > 0, "PCA result has no components.")) # Add check for components
    pc_choices <- paste0("PC", 1:n_pcs)
    selectInput("pca_x_axis", "X-Axis:", choices = pc_choices, selected = "PC1")
  })
  output$pca_y_axis_selector <- renderUI({
    pca_res <- rv$pca_result_obj # Use the stored result object
    validate(need(!is.null(pca_res) && inherits(pca_res, "prcomp"), "Run PCA first."))
    n_pcs <- ncol(pca_res$x)
    validate(need(n_pcs > 0, "PCA result has no components.")) # Add check for components
    pc_choices <- paste0("PC", 1:n_pcs)
    selected_y <- if (n_pcs >= 2) "PC2" else "PC1"
    selectInput("pca_y_axis", "Y-Axis:", choices = pc_choices, selected = selected_y)
  })
  
  
  # --- Analysis Tab Outputs ---
  # Structure
  output$structure <- renderPrint({ df <- rv$processed_data; validate(need(!is.null(df), "Process data.")); cat("Data Structure:\n"); df_display <- df %>% select(-any_of(".row_id")); validate(need(ncol(df_display) > 0, "No columns.")); str(df_display) })
  # Summary
  output$summary <- renderPrint({ df <- rv$processed_data; validate(need(!is.null(df), "Process data.")); cat("Summary Statistics:\n"); df_display <- df %>% select(-any_of(".row_id")); validate(need(ncol(df_display) > 0, "No columns.")); summary(df_display) }) |> bindCache(rv$processed_data)
  
  # Normality Test (with sampling > 5000)
  output$normality_test_results <- renderPrint({
    req(rv$processed_data, input$norm_var)
    df <- rv$processed_data; var_norm <- input$norm_var; transform_type <- input$norm_transform
    validate(need(var_norm %in% names(df), paste("Selected variable '", var_norm, "' not found.", sep="")),
             need(is.numeric(df[[var_norm]]), "Selected variable must be numeric."))
    data_to_test_orig <- tryCatch({ apply_transform(df[[var_norm]], transform_type) }, warning = function(w) { showNotification(w$message); apply_transform(df[[var_norm]], transform_type) })
    validate(need(is.numeric(data_to_test_orig) && !all(is.na(data_to_test_orig)), "Transform failed."))
    valid_data <- data_to_test_orig[!is.na(data_to_test_orig)]
    n_valid <- length(valid_data)
    validate(need(n_valid >= 3, "Need >= 3 non-missing points."))
    validate(need(length(unique(valid_data)) > 1, "Need > 1 unique value."))
    
    test_result <- NULL; test_name <- "Shapiro-Wilk"; sample_info <- ""
    if (n_valid > 5000) {
      set.seed(123); valid_data_sample <- sample(valid_data, 5000)
      test_result <- tryCatch(shapiro.test(valid_data_sample), error = function(e) e)
      sample_info <- "(on a sample of 5000 points)"
      showNotification("Sample size > 5000, Shapiro-Wilk test performed on a random sample of 5000 points.", type = "warning", duration = 7)
    } else { test_result <- tryCatch(shapiro.test(valid_data), error = function(e) e) }
    if (inherits(test_result, "error")) { return(paste("Normality test error:", test_result$message)) }
    title <- paste0(test_name, " Normality Test ", sample_info, " for: ", if(transform_type != "None") paste0(transform_type, "(", var_norm, ")") else var_norm)
    cat(title, "\n"); cat("------------------------------------\n"); print(test_result); cat("\n--- Interpretation ---\n"); cat("H0: Normal\nHa: Not Normal\n\n"); p_value <- test_result$p.value
    if (p_value <= 0.05) { cat(paste0("Result: p (", signif(p_value, 3), ") <= 0.05. Reject H0. Conclusion: Not Normal.\n")) } else { cat(paste0("Result: p (", signif(p_value, 3), ") > 0.05. Fail to reject H0. Conclusion: No evidence against normality.\n")) }
  }) |> bindCache(rv$processed_data[[input$norm_var]], input$norm_transform)
  
  # Histogram
  output$histogram <- renderPlotly({
    req(rv$processed_data, input$hist_var)
    df <- rv$processed_data; hist_var <- input$hist_var; transform_type <- input$hist_transform; bins <- input$hist_bins; density_overlay <- input$density_overlay
    validate(need(hist_var %in% names(df), paste("Selected variable '", hist_var, "' not found.", sep="")),
             need(is.numeric(df[[hist_var]]), "Selected variable must be numeric."))
    df_temp <- tryCatch({ df %>% mutate(transformed_var = apply_transform(.data[[hist_var]], transform_type)) }, warning = function(w) { showNotification(w$message); suppressWarnings(df %>% mutate(transformed_var = apply_transform(.data[[hist_var]], transform_type))) })
    validate(need("transformed_var" %in% names(df_temp) && is.numeric(df_temp$transformed_var) && !all(is.na(df_temp$transformed_var)), "Transform failed."))
    plot_title <- paste("Histogram:", if(transform_type != "None") paste0(transform_type, "(", hist_var, ")") else hist_var); x_label <- plot_title
    p_gg <- ggplot(df_temp, aes(x = transformed_var)) + geom_histogram(bins = bins, fill = "skyblue", color = 'white', alpha = 0.7) + labs(title = plot_title, x = x_label, y = "Frequency") + theme_minimal()
    if (density_overlay) { valid_transformed_data <- df_temp$transformed_var[!is.na(df_temp$transformed_var)]; if(length(valid_transformed_data) > 1 && length(unique(valid_transformed_data)) > 1) { tryCatch({ p_gg <- p_gg + geom_density(aes(y = after_stat(density)), color = "darkblue", fill="darkblue", alpha=0.2) }, error = function(e){ showNotification(paste("Density error:", e$message)) }) } }
    rv$gg_hist <- p_gg; ggplotly(p_gg)
  }) |> bindCache(rv$processed_data[[input$hist_var]], input$hist_transform, input$hist_bins, input$density_overlay)
  
  # Scatter Plot (with sampling > 10k)
  output$scatterPlot <- renderPlotly({
    req(rv$processed_data, input$scatter_var_x, input$scatter_var_y)
    df <- rv$processed_data
    var_x <- input$scatter_var_x; var_y <- input$scatter_var_y; transform_x <- input$scatter_x_transform; transform_y <- input$scatter_y_transform
    validate(need(var_x %in% names(df), paste("X variable '", var_x, "' not found.", sep="")), need(is.numeric(df[[var_x]]), "X numeric."),
             need(var_y %in% names(df), paste("Y variable '", var_y, "' not found.", sep="")), need(is.numeric(df[[var_y]]), "Y numeric."),
             need(var_x != var_y, "X != Y."))
    df_temp <- tryCatch({ df %>% mutate(transformed_x = apply_transform(.data[[var_x]], transform_x), transformed_y = apply_transform(.data[[var_y]], transform_y)) }, warning = function(w) { showNotification(w$message); suppressWarnings(df %>% mutate(transformed_x = apply_transform(.data[[var_x]], transform_x), transformed_y = apply_transform(.data[[var_y]], transform_y))) })
    validate(need("transformed_x" %in% names(df_temp) && is.numeric(df_temp$transformed_x), "X Transform failed."), need("transformed_y" %in% names(df_temp) && is.numeric(df_temp$transformed_y), "Y Transform failed."))
    df_plot <- df_temp %>% filter(!is.na(transformed_x) & !is.na(transformed_y)); validate(need(nrow(df_plot) > 0, "No complete observations."))
    max_points <- 10000
    if (nrow(df_plot) > max_points) { set.seed(456); df_plot <- sample_n(df_plot, max_points); showNotification(paste("Displaying sample of", max_points, "points."), type = "warning", duration = 7) }
    x_label <- if(transform_x != "None") paste0(transform_x, "(", var_x, ")") else var_x; y_label <- if(transform_y != "None") paste0(transform_y, "(", var_y, ")") else var_y; plot_title <- paste("Scatter:", y_label, "vs", x_label)
    p_gg <- ggplot(df_plot, aes(x = transformed_x, y = transformed_y)) + geom_point(alpha = 0.6, color = "blue") + geom_smooth(method = "lm", se = FALSE, color = "red", formula = y ~ x) + labs(title = plot_title, x = x_label, y = y_label) + theme_minimal()
    rv$gg_scatter <- p_gg; ggplotly(p_gg)
  }) |> bindCache(rv$processed_data[[input$scatter_var_x]], rv$processed_data[[input$scatter_var_y]], input$scatter_x_transform, input$scatter_y_transform)
  
  # Linear Model Summary
  output$lm_summary_results <- renderPrint({
    req(rv$processed_data, input$scatter_var_x, input$scatter_var_y)
    df <- rv$processed_data
    var_x <- input$scatter_var_x; var_y <- input$scatter_var_y; transform_x <- input$scatter_x_transform; transform_y <- input$scatter_y_transform
    validate(need(var_x %in% names(df), paste("X variable '", var_x, "' not found.", sep="")), need(is.numeric(df[[var_x]]), "X numeric."),
             need(var_y %in% names(df), paste("Y variable '", var_y, "' not found.", sep="")), need(is.numeric(df[[var_y]]), "Y numeric."),
             need(var_x != var_y, "X != Y."))
    df_temp <- tryCatch({ suppressWarnings( df %>% mutate( transformed_x = apply_transform(.data[[var_x]], transform_x), transformed_y = apply_transform(.data[[var_y]], transform_y) ) ) }, error = function(e) { NULL })
    validate(need(!is.null(df_temp), "Transform error.")); validate(need(sum(complete.cases(df_temp$transformed_x, df_temp$transformed_y)) >= 2, "Need >= 2 complete obs."))
    y_lm <- "transformed_y"; x_lm <- "transformed_x"; y_disp <- if(transform_y != "None") paste0(transform_y, "(", var_y, ")") else var_y; x_disp <- if(transform_x != "None") paste0(transform_x, "(", var_x, ")") else var_x
    tryCatch({ formula_str <- paste0(y_lm, " ~ ", x_lm); lm_result <- lm(as.formula(formula_str), data = df_temp, na.action = na.omit); lm_summary <- summary(lm_result)
    cat(paste("Linear Model:", y_disp, "~", x_disp, "\n")); cat("------------------------------------\n"); print(lm_summary); cat("\n--- Interpretation ---\n"); r_sq <- signif(lm_summary$r.squared, 3); adj_r_sq <- signif(lm_summary$adj.r.squared, 3)
    cat(paste0("- R2: ", r_sq, " (", round(r_sq*100,1), "% var explained)\n")); cat(paste0("- Adj R2: ", adj_r_sq, "\n"))
    f_p <- tryCatch(signif(pf(lm_summary$fstatistic[1], lm_summary$fstatistic[2], lm_summary$fstatistic[3], lower.tail=FALSE), 3), error=function(e) NA)
    if (!is.null(lm_summary$fstatistic) && !is.na(f_p)) { cat(paste0("- F-p: ", f_p, " (Overall model ", if(f_p <= 0.05) "significant" else "not significant", ")\n")) } else { cat("- F-p: NA\n") }
    cat("- Coefficients (Pr(>|t|) <= 0.05 is significant)\n")
    }, error = function(e) { paste("LM error:", e$message) })
  }) |> bindCache(rv$processed_data[[input$scatter_var_x]], rv$processed_data[[input$scatter_var_y]], input$scatter_x_transform, input$scatter_y_transform)
  
  # Box Plot
  output$boxPlot <- renderPlotly({
    req(rv$processed_data, input$boxplot_var_cat, input$boxplot_var_num)
    df <- rv$processed_data
    var_cat <- input$boxplot_var_cat; var_num <- input$boxplot_var_num; transform_num <- input$boxplot_num_transform
    validate(need(var_cat %in% names(df), paste("Grouping variable '", var_cat, "' not found.", sep="")),
             need(is.factor(df[[var_cat]]) || is.character(df[[var_cat]]), "Grouping variable must be categorical."),
             need(var_num %in% names(df), paste("Value variable '", var_num, "' not found.", sep="")),
             need(is.numeric(df[[var_num]]), "Value variable must be numeric."))
    df_temp <- tryCatch({ df %>% mutate(transformed_num = apply_transform(.data[[var_num]], transform_num)) }, warning = function(w) { showNotification(w$message); suppressWarnings(df %>% mutate(transformed_num = apply_transform(.data[[var_num]], transform_num))) })
    validate(need("transformed_num" %in% names(df_temp) && is.numeric(df_temp$transformed_num) && !all(is.na(df_temp$transformed_num)), "Transform failed."))
    df_temp[[var_cat]] <- as.factor(df_temp[[var_cat]])
    y_label <- if(transform_num != "None") paste0(transform_num, "(", var_num, ")") else var_num; plot_title <- paste("Box Plot:", y_label, "by", var_cat)
    p_gg <- ggplot(df_temp, aes(x = .data[[var_cat]], y = transformed_num, fill = .data[[var_cat]])) + geom_boxplot(alpha = 0.7, outlier.colour = "red") + labs(title = plot_title, x = var_cat, y = y_label) + theme_minimal() + theme(axis.text.x = element_text(angle = 45, hjust = 1), legend.position = "none")
    rv$gg_box <- p_gg; ggplotly(p_gg)
  }) |> bindCache(rv$processed_data[[input$boxplot_var_cat]], rv$processed_data[[input$boxplot_var_num]], input$boxplot_num_transform)
  
  # ANOVA/t-test Logic (Reactive)
  anova_test_result_reactive <- reactive({
    req(rv$processed_data, input$boxplot_var_cat, input$boxplot_var_num)
    df <- rv$processed_data
    var_cat <- input$boxplot_var_cat; var_num <- input$boxplot_var_num; transform_num <- input$boxplot_num_transform
    validate(need(var_cat %in% names(df), paste("Grouping variable '", var_cat, "' not found.", sep="")),
             need(is.factor(df[[var_cat]]) || is.character(df[[var_cat]]), "Group var categorical."),
             need(var_num %in% names(df), paste("Value variable '", var_num, "' not found.", sep="")),
             need(is.numeric(df[[var_num]]), "Value var numeric."))
    df_temp <- tryCatch({ suppressWarnings( df %>% mutate(transformed_num = apply_transform(.data[[var_num]], transform_num)) ) }, error = function(e) { list(message=paste("Transform error:", e$message)) })
    validate(need(inherits(df_temp, "data.frame") && "transformed_num" %in% names(df_temp), "Transform error.")); validate(need(is.numeric(df_temp$transformed_num) && !all(is.na(df_temp$transformed_num)), "Transform failed."))
    df_temp[[var_cat]] <- as.factor(df_temp[[var_cat]]); valid_data_for_levels <- df_temp[!is.na(df_temp$transformed_num), ]; num_levels <- nlevels(droplevels(factor(valid_data_for_levels[[var_cat]])))
    result_list <- list(result=NULL, message=NULL, type=NULL, aov_obj=NULL, p_value = NA); formula_str <- tryCatch(paste0("transformed_num ~ `", var_cat, "`"), error = function(e) NULL); validate(need(!is.null(formula_str), "Formula error."))
    if (num_levels < 2) { result_list$message <- "Need >= 2 groups with valid data." } else if (num_levels == 2) { result_list$type <- "t-test"; tryCatch({ test_obj <- t_test_memoised(formula = formula_str, data = df_temp); result_list$result <- test_obj; result_list$p_value <- test_obj$p.value }, error = function(e) { result_list$message <- paste("T-test error:", e$message) })
    } else { result_list$type <- "ANOVA"; tryCatch({ aov_obj <- anova_test_memoised(formula = formula_str, data = df_temp); aov_summary <- summary(aov_obj); result_list$aov_obj <- aov_obj; result_list$result <- aov_summary; result_list$p_value <- tryCatch(aov_summary[[1]]$`Pr(>F)`[1], error=function(e) NA) }, error = function(e) { result_list$message <- paste("ANOVA error:", e$message) }) }
    return(result_list)
  }) |> bindCache(rv$processed_data[[input$boxplot_var_cat]], rv$processed_data[[input$boxplot_var_num]], input$boxplot_num_transform)
  
  # ANOVA / t-test Results Output
  output$anova_ttest_results <- renderPrint({
    test_info <- anova_test_result_reactive(); validate(need(!is.null(test_info), "Waiting..."))
    req(input$boxplot_var_num) # Ensure input exists
    var_num_disp <- if(input$boxplot_num_transform != "None") paste0(input$boxplot_num_transform, "(", input$boxplot_var_num, ")") else input$boxplot_var_num
    if (!is.null(test_info$message)) { cat(test_info$message) } else if (!is.null(test_info$result)) { title <- if(test_info$type == "t-test") "Welch T-test" else "ANOVA"; cat(paste(title, ":", var_num_disp, "by", input$boxplot_var_cat, "\n")); cat("------------------------------------\n"); print(test_info$result); cat("\n--- Interpretation ---\n"); cat("H0: Means same\nHa: Means differ\n\n"); if (!is.na(test_info$p_value)) { if (test_info$p_value <= 0.05) { cat(paste0("Result: p (", signif(test_info$p.value, 3), ") <= 0.05. Reject H0. Conclusion: Significant difference.\n")); if (test_info$type == "ANOVA") cat("(See Tukey HSD below).\n") } else { cat(paste0("Result: p (", signif(test_info$p.value, 3), ") > 0.05. Fail reject H0. Conclusion: No significant difference.\n")) } } else { cat("Could not extract p-value.\n") } } else { cat("Test not performed.") }
  })
  
  # Post-Hoc Results Output
  output$posthoc_results <- renderPrint({
    test_info <- anova_test_result_reactive(); validate(need(!is.null(test_info), "Waiting..."))
    req(input$boxplot_var_num) # Ensure input exists
    var_num_disp <- if(input$boxplot_num_transform != "None") paste0(input$boxplot_num_transform, "(", input$boxplot_var_num, ")") else input$boxplot_var_num
    if (!is.null(test_info$type) && test_info$type == "ANOVA" && !is.null(test_info$aov_obj) && !is.na(test_info$p_value) && test_info$p_value <= 0.05) { cat("\n------------------------------------\n"); cat(paste("Tukey HSD Results:", var_num_disp, "\n")); cat("------------------------------------\n"); tryCatch({ tukey_result <- TukeyHSD(test_info$aov_obj); print(tukey_result); cat("\n--- Interpretation ---\n"); cat("'p adj' <= 0.05 -> significant difference between pair.\n") }, error = function(e) { paste("Tukey HSD error:", e$message) }) } else { return(invisible(NULL)) }
  })
  
  # Correlation Plot
  output$correlationPlot <- renderPlot({
    req(rv$processed_data, input$correlation_vars)
    validate(need(length(input$correlation_vars) >= 2, "Select >= 2 numeric vars."))
    df <- rv$processed_data; selected_vars <- input$correlation_vars; cor_method <- input$cor_method; sig_level <- input$cor_sig_level; use_ggpairs_flag <- input$use_ggpairs
    selected_vars_exist <- selected_vars[selected_vars %in% names(df)]
    validate(need(length(selected_vars_exist) == length(selected_vars), "One or more selected variables not found."))
    cor_data <- df %>% select(all_of(selected_vars_exist)) %>% select(where(is.numeric)); validate(need(ncol(cor_data) >= 2, "Need >= 2 valid numeric columns selected."))
    if (use_ggpairs_flag) {
      p <- tryCatch({ ggpairs(cor_data, title = "GGPairs Plot") }, error = function(e) { showNotification(paste("GGPairs Error:", e$message)); NULL })
      validate(need(!is.null(p), "GGPairs failed."))
      rv$corr_plot_obj <- p # Store ggpairs object
      print(p)
    } else {
      cor_matrix <- calculate_cor_matrix_memoised(cor_data, cor_method)
      p_matrix <- calculate_p_matrix_memoised(cor_data, cor_method)
      validate(need(!is.null(cor_matrix) && !is.null(p_matrix), "Corr calc failed."))
      # Store matrices and parameters for report/download
      rv$corr_plot_obj <- list(type = "corrplot", cor_matrix = cor_matrix, p_matrix = p_matrix, sig.level = sig_level)
      # Draw plot
      corrplot(cor_matrix, method = "circle", type = "upper", order = "hclust", tl.col = "black", tl.srt = 45, p.mat = p_matrix, sig.level = sig_level, insig = "blank", diag = FALSE, addCoef.col = "black", number.cex = 0.8)
    }
  })
  
  # --- PCA Analysis ---
  # Reactive expression to perform PCA calculation when button is clicked
  pca_results_reactive <- eventReactive(input$run_pca, {
    req(rv$processed_data)
    df <- rv$processed_data
    pca_scale_opt <- as.logical(input$pca_scale)
    
    numeric_cols <- setdiff(names(df)[sapply(df, is.numeric)], ".row_id")
    validate(need(length(numeric_cols) >= 2, "Need at least 2 numeric variables for PCA."))
    
    pca_data <- df[, numeric_cols, drop = FALSE]
    pca_data_complete <- na.omit(pca_data)
    validate(need(nrow(pca_data_complete) >= 2, "Need at least 2 complete cases for PCA."))
    validate(need(ncol(pca_data_complete) >= 2, "Need at least 2 numeric columns with data for PCA."))
    
    col_variances <- apply(pca_data_complete, 2, var, na.rm = TRUE)
    valid_cols_pca <- !is.na(col_variances) & col_variances > 1e-10 # Check for near-zero variance too
    if(!all(valid_cols_pca)) {
      invalid_cols <- names(col_variances[!valid_cols_pca])
      showNotification(paste("Zero/NA variance cols removed before PCA:", paste(invalid_cols, collapse=", ")), type="warning")
      pca_data_complete <- pca_data_complete[, valid_cols_pca, drop = FALSE]
      validate(need(ncol(pca_data_complete) >= 2, "Not enough columns with variance for PCA."))
    }
    
    # Perform PCA using memoised function
    pca_res <- tryCatch({
      prcomp_memoised(pca_data_complete, scale. = pca_scale_opt)
    }, error = function(e) {
      showNotification(paste("PCA Error:", e$message), type="error")
      return(NULL) # Return NULL on error
    })
    # Store result in rv upon successful calculation
    if(!is.null(pca_res)) rv$pca_result_obj <- pca_res
    # Reset plot object when PCA is re-run
    rv$pca_plot <- NULL
    return(pca_res)
  })
  
  # PCA Biplot (depends on pca_results_reactive)
  output$pca_biplot <- renderPlot({
    pca_result <- pca_results_reactive() # Triggered by button, returns result or NULL
    validate(need(!is.null(pca_result) && inherits(pca_result, "prcomp"),
                  "Click 'Run PCA Analysis' to generate results."))
    req(input$pca_x_axis, input$pca_y_axis) # Require axis selections
    
    pca_x_choice <- input$pca_x_axis; pca_y_choice <- input$pca_y_axis
    n_pcs_available <- ncol(pca_result$x)
    pc_x_index <- as.numeric(gsub("PC", "", pca_x_choice))
    pc_y_index <- as.numeric(gsub("PC", "", pca_y_choice))
    
    validate(need(pc_x_index <= n_pcs_available, "Selected X-axis PC not available."),
             need(pc_y_index <= n_pcs_available, "Selected Y-axis PC not available."),
             need(pc_x_index != pc_y_index, "X and Y axes must be different PCs."))
    
    tryCatch({
      # Capture the plot for download/report
      biplot_obj <- recordPlot({ biplot(pca_result, choices = c(pc_x_index, pc_y_index), # Use selected indices
                                        cex = c(0.7, 0.8), scale = 0,
                                        main = paste("PCA Biplot (", pca_x_choice, "vs", pca_y_choice, ")")) })
      rv$pca_plot <- biplot_obj # Store captured plot
      replayPlot(biplot_obj) # Display the captured plot
    }, error = function(e){ showNotification(paste("Biplot Error:", e$message)); plot.new(); title("Biplot failed"); rv$pca_plot <- NULL })
  }) # Removed bindCache here as it depends on eventReactive
  
  # PCA Summary (depends on pca_results_reactive)
  output$pca_summary <- renderPrint({
    pca_result <- pca_results_reactive() # Triggered by button
    validate(need(!is.null(pca_result) && inherits(pca_result, "prcomp"),
                  "Click 'Run PCA Analysis' to generate results."))
    cat("PCA Summary:\n"); cat("-------------\n"); print(summary(pca_result)); cat("\nLoadings (First 2 Components):\n")
    n_comp_summary <- min(2, ncol(pca_result$rotation)); loadings <- pca_result$rotation[, 1:n_comp_summary, drop=FALSE]; print(round(loadings, 3))
    cat("\n--- Notes ---\n"); cat("- Importance: Proportion of Variance explained.\n"); cat("- Loadings: Variable contribution to PCs.\n"); cat("- Biplot: Visualizes observations & variables.\n")
  }) # Removed bindCache here
  
  # Data Table
  output$contents <- DT::renderDataTable({ df <- rv$processed_data; validate(need(!is.null(df), "Process data.")); df_display <- df %>% select(-any_of(".row_id")); validate(need(ncol(df_display) > 0, "No columns.")); DT::datatable(df_display, options = list(pageLength = 10, scrollX = TRUE), rownames = FALSE) })
  
  # --- Download Handlers ---
  output$downloadData <- downloadHandler( filename = function() { paste0("processed_data-", Sys.Date(), ".csv") }, content = function(file) { df_to_download <- rv$processed_data; validate(need(!is.null(df_to_download), "No data.")); write.csv(df_to_download %>% select(-any_of(".row_id")), file, row.names = FALSE) } )
  output$downloadPlotHist <- downloadHandler( filename = function() { paste0("histogram-", Sys.Date(), ".png") }, content = function(file) { gg_plot <- rv$gg_hist; validate(need(!is.null(gg_plot), "Generate plot.")); ggsave(file, plot = gg_plot, device = "png", width = 8, height = 6, dpi = 300) }, contentType = "image/png" )
  output$downloadPlotScatter <- downloadHandler( filename = function() { paste0("scatter_plot-", Sys.Date(), ".png") }, content = function(file) { gg_plot <- rv$gg_scatter; validate(need(!is.null(gg_plot), "Generate plot.")); ggsave(file, plot = gg_plot, device = "png", width = 8, height = 6, dpi = 300) }, contentType = "image/png" )
  output$downloadPlotBox <- downloadHandler( filename = function() { paste0("box_plot-", Sys.Date(), ".png") }, content = function(file) { gg_plot <- rv$gg_box; validate(need(!is.null(gg_plot), "Generate plot.")); ggsave(file, plot = gg_plot, device = "png", width = 8, height = 6, dpi = 300) }, contentType = "image/png" )
  output$downloadPlotCorr <- downloadHandler( filename = function() { paste0("correlation_plot-", Sys.Date(), ".png") }, content = function(file) { plot_obj_info <- rv$corr_plot_obj; validate(need(!is.null(plot_obj_info), "Generate plot.")); if (inherits(plot_obj_info, "gg")) { ggsave(file, plot = plot_obj_info, device = "png", width = 10, height = 10, dpi = 300) } else if (is.list(plot_obj_info) && !is.null(plot_obj_info$type) && plot_obj_info$type == "corrplot") { png(file, width = 8, height = 8, units = "in", res = 300); tryCatch({ corrplot(plot_obj_info$cor_matrix, method = "circle", type = "upper", order = "hclust", tl.col = "black", tl.srt = 45, p.mat = plot_obj_info$p_matrix, sig.level = plot_obj_info$sig.level, insig = "blank", diag = FALSE, addCoef.col = "black", number.cex = 0.8) }, finally = { dev.off() }) } else { stop("Unknown plot type.") } }, contentType = "image/png" )
  output$downloadPlotPCA <- downloadHandler( filename = function() { paste0("pca_biplot-", Sys.Date(), ".png") }, content = function(file) { pca_plot_obj <- rv$pca_plot; validate(need(!is.null(pca_plot_obj), "Generate PCA plot.")); png(file, width = 8, height = 7, units = "in", res = 300); tryCatch({ replayPlot(pca_plot_obj) }, finally = { dev.off() }) }, contentType = "image/png" )
  output$downloadReport <- downloadHandler(
    filename = function() { paste0("EDA_Report_", Sys.Date(), ".pdf") },
    content = function(file) {
      # --- Validation before starting report ---
      validate(
        need(!is.null(rv$processed_data), "No processed data available for the report."),
        need(!is.null(rv$gg_hist) || !is.null(rv$gg_scatter) || !is.null(rv$gg_box) || !is.null(rv$corr_plot_obj) || !is.null(rv$pca_result_obj),
             "Please generate at least one plot or analysis (Correlation, PCA) before creating the report.")
      )
      # --- End Validation ---
      
      # Check for LaTeX installation
      if (!tinytex::is_tinytex()) {
        showNotification("LaTeX (TinyTeX) not detected. PDF report generation requires a LaTeX installation. Please install TinyTeX via tinytex::install_tinytex() in your R console.", type = "error", duration = 15)
        file.create(file); return() # Create empty file and exit
      }
      
      id <- showNotification("Generating report...", duration = NULL, closeButton = FALSE)
      on.exit(removeNotification(id), add = TRUE)
      tempReport <- file.path(tempdir(), "report.Rmd")
      
      # Fetch PCA results for the report if available
      pca_res_for_report <- rv$pca_result_obj # Use the stored PCA result object
      
      # Prepare parameters, including corrplot matrices if available
      corr_params <- list(corr_plot_cor_matrix = NULL, corr_plot_p_matrix = NULL, corr_plot_sig_level = NULL)
      if(is.list(rv$corr_plot_obj) && !is.null(rv$corr_plot_obj$type) && rv$corr_plot_obj$type == "corrplot") {
        corr_params$corr_plot_cor_matrix <- rv$corr_plot_obj$cor_matrix
        corr_params$corr_plot_p_matrix <- rv$corr_plot_obj$p_matrix
        corr_params$corr_plot_sig_level <- rv$corr_plot_obj$sig.level
      }
      
      # Prepare summary object safely
      data_summary_obj <- tryCatch(
        summary(rv$processed_data %>% select(-any_of(".row_id"))),
        error = function(e) {
          warning("Could not generate data summary for report: ", e$message)
          NULL # Return NULL if summary fails
        }
      )
      # Prepare PCA summary object safely
      pca_summary_obj <- if(inherits(pca_res_for_report, "prcomp")) {
        tryCatch(summary(pca_res_for_report), error = function(e) {
          warning("Could not generate PCA summary for report: ", e$message)
          NULL # Return NULL if summary fails
        })
      } else { NULL }
      
      # Prepare parameters list
      report_params <- list(
        data_name = ifelse(!is.null(input$file1$name), input$file1$name, "Uploaded Data"),
        processed_data_summary = data_summary_obj,
        hist_plot = rv$gg_hist,
        scatter_plot = rv$gg_scatter,
        box_plot = rv$gg_box,
        ggpairs_plot = if(inherits(rv$corr_plot_obj, "gg")) rv$corr_plot_obj else NULL,
        corr_plot_cor_matrix = corr_params$corr_plot_cor_matrix, # Pass matrices
        corr_plot_p_matrix = corr_params$corr_plot_p_matrix,
        corr_plot_sig_level = corr_params$corr_plot_sig_level,
        pca_result_obj = pca_res_for_report, # Pass the prcomp object
        pca_x_axis = isolate(input$pca_x_axis), # Pass selected axes
        pca_y_axis = isolate(input$pca_y_axis)
        # NOTE: We are NOT passing pca_plot (the recorded plot) anymore
      )
      
      # Filter out NULL parameters *before* generating content
      report_params_clean <- report_params[!sapply(report_params, is.null)]
      
      report_content <- generate_rmd_content(params = report_params_clean) # Pass cleaned params
      writeLines(report_content, tempReport)
      
      render_result <- tryCatch({
        rmarkdown::render(tempReport, output_file = file,
                          # Pass parameters again to the render function
                          params = report_params_clean,
                          envir = new.env(parent = globalenv()),
                          quiet = TRUE) # Suppress verbose output
        TRUE
      }, error = function(e) {
        msg <- paste("Report generation failed:", e$message)
        # Attempt to capture LaTeX log if possible (requires tinytex)
        log_file <- file.path(dirname(tempReport), "report.log")
        if (file.exists(log_file)) {
          latex_log <- tryCatch(paste(readLines(log_file, n=50), collapse="\n"), error=function(e) "") # Read first 50 lines
          msg <- paste(msg, "\n\n--- LaTeX Log Snippet ---\n", latex_log, "\n--- End Log Snippet ---")
        } else if (grepl("LaTeX failed", e$message, ignore.case = TRUE)) {
          msg <- paste(msg, "\n\nThis often indicates a LaTeX installation issue or problematic characters in data/plots.")
        }
        showNotification(HTML(gsub("\n", "<br/>", msg)), type = "error", duration = 20) # Longer duration for error
        FALSE
      })
      
      if (!render_result) {
        file.create(file) # Create empty file on failure
      } else {
        showNotification("Report generated successfully!", type="message")
      }
    }
  )
  
  
}

# Run the application
shinyApp(ui = ui, server = server)
