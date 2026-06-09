# Set maximum upload size (e.g., to 500MB)
options(shiny.maxRequestSize = 500*1024^2)

# Load necessary libraries
library(shiny)
library(bslib)          # Modern UI components
library(ASRgenomics)
library(tidyverse)      # Includes dplyr, ggplot2, readr, tibble
library(DT)             # For interactive tables
library(shinycssloaders)# For loading spinners
library(shinyjs)        # For disabling buttons, reset
library(plotly)         # For interactive plots
library(shinyWidgets)   # For better input widgets (using materialSwitch)
library(cachem)         # For caching
library(memoise)        # For memoization
library(heatmaply)      # For interactive heatmaps

# --- Caching Setup ---
# Set up cache for expensive operations
cache <- cachem::cache_mem(max_size = 1024 * 1024^2) # 1GB memory cache

# Memoize expensive functions for performance
memoized_qc_filtering <- memoise(qc.filtering, cache = cache)
memoized_G_matrix <- memoise(G.matrix, cache = cache)
memoized_kinship_diag <- memoise(kinship.diagnostics, cache = cache)
memoized_G_tuneup <- memoise(G.tuneup, cache = cache)
memoized_kinship_pca <- memoise(kinship.pca, cache = cache)
memoized_G_inverse <- memoise(G.inverse, cache = cache)
memoized_match_kinship2pheno <- memoise(match.kinship2pheno, cache = cache)

# --- UI Definition ---
ui <- page_fluid(
  useShinyjs(), # Initialize shinyjs
  theme = bs_theme(
    version = 5,
    preset = "cerulean"
  ),
  
  # App Title
  titlePanel("GRM Preparation with ASRgenomics"),
  
  # Create tabs with modern styling
  navset_pill(
    id = "main_nav",
    
    # Panel 1: Data Upload and QC
    nav_panel(
      title = "1. Input & QC",
      value = "tab_qc",
      page_sidebar(
        sidebar = sidebar(
          title = "QC Controls",
          width = 350,
          actionButton("reset_inputs", "Reset All Inputs", icon = icon("refresh"), class = "btn-warning w-100 mb-3"),
          card(
            card_header("Quick Start Guide"),
            tags$ol(
              tags$li("Upload SNP matrix (tab separated)"),
              tags$li("Upload phenotype data (CSV)"),
              tags$li("Set QC parameters"),
              tags$li("Click 'Run QC Filtering'")
            ),
            class = "bg-info-subtle mb-3"
          ),
          card(
            card_header(class = "bg-primary text-white", "Data Upload"),
            fileInput("snp_file", "Upload SNP Matrix File", accept = c("text/plain", ".txt", ".dat", ".tsv"), placeholder = "Tab separated; Col1=ID, others=Markers"),
            tooltip(span(icon("circle-info"), " Format Help"), "First column must be unique IDs, subsequent columns are numeric markers (0,1,2). Tab separated.", placement = "right"),
            helpText("Preview (first 6 rows):"),
            verbatimTextOutput("snp_preview"),
            fileInput("pheno_file", "Upload Phenotype Data File", accept = c(".csv"), placeholder = "CSV format"),
            tooltip(span(icon("circle-info"), " Format Help"), "Standard CSV format. Must include an ID column matching genotype IDs.", placement = "right"),
            helpText("Preview (first 6 rows):"),
            tableOutput("pheno_preview"),
            class = "mb-3"
          ),
          card(
            card_header(class = "bg-primary text-white", "QC Parameters"),
            sliderInput("marker_callrate", "Min. Marker Call Rate", min = 0.5, max = 1, value = 0.8, step = 0.05),
            sliderInput("ind_callrate", "Min. Individual Call Rate", min = 0.5, max = 1, value = 0.9, step = 0.05),
            sliderInput("maf", "Min. Minor Allele Frequency (MAF)", min = 0.01, max = 0.5, value = 0.05, step = 0.01),
            sliderInput("heterozygosity", "Max. Heterozygosity", min = 0.5, max = 1, value = 0.95, step = 0.05),
            sliderInput("Fis", "Max. Fis (Inbreeding Coeff.)", min = -1, max = 1, value = 1, step = 0.1),
            materialSwitch("impute_qc", "Impute Missing Genotypes (Mean)?", value = FALSE, status = "primary", right = TRUE),
            actionButton("run_qc", "Run QC Filtering", icon=icon("play"), class = "btn-success w-100 mt-3")
          )
        ), # End sidebar
        card(
          card_header("QC Filtering Summary"),
          verbatimTextOutput("qc_summary") %>% withSpinner(type = 6, color = "#0dc5c1"),
          class = "mb-3"
        ),
        card(
          card_header("QC Plots"),
          navset_card_tab(
            nav_panel("MAF", plotlyOutput("qc_plot_maf") %>% withSpinner(type = 6, color = "#0dc5c1")),
            nav_panel("Missing (Ind.)", plotlyOutput("qc_plot_missing_ind") %>% withSpinner(type = 6, color = "#0dc5c1")),
            nav_panel("Missing (SNP)", plotlyOutput("qc_plot_missing_snp") %>% withSpinner(type = 6, color = "#0dc5c1")),
            nav_panel("Heterozygosity", plotlyOutput("qc_plot_heteroz") %>% withSpinner(type = 6, color = "#0dc5c1")),
            nav_panel("Fis", plotlyOutput("qc_plot_fis") %>% withSpinner(type = 6, color = "#0dc5c1"))
          )
        )
      ) # End page_sidebar
    ), # End nav_panel 1
    
    # Panel 2: GRM Calculation and Diagnostics
    nav_panel(
      title = "2. GRM & Diagnostics",
      value = "tab_grm",
      page_sidebar(
        sidebar = sidebar(
          title = "GRM Controls",
          width = 350,
          card(
            card_header(class = "bg-primary text-white", "GRM Calculation & Tuning"),
            helpText("Ensure QC has been run successfully on Tab 1."),
            selectInput("grm_method", "GRM Method", choices = c("VanRaden", "Yang"), selected = "VanRaden"),
            radioButtons("tune_type", "Tuning Method:", choices = c("None", "Bend", "Blend"), selected = "Bend", inline = TRUE),
            hr(),
            h4("Kinship Diagnostics Parameters"),
            numericInput("diag_thr_small", "Min Diagonal Threshold", value = 0.8, min = 0, max = 2, step = 0.1),
            numericInput("diag_thr_large", "Max Diagonal Threshold", value = 2.0, min = 0, max = 5, step = 0.1),
            numericInput("duplicate_thr", "Duplicate Threshold", value = 0.95, min = 0, max = 1, step = 0.01),
            actionButton("run_grm", "Calculate GRM & Diagnostics", icon=icon("play"), class = "btn-success w-100 mt-3")
          )
        ), # End sidebar
        layout_columns(
          col_widths = c(6, 6),
          value_box(title = "Original GRM Dimensions", value = textOutput("grm_original_dims"), showcase = icon("dna"), theme = "primary"),
          value_box(title = "Tuning Status", value = textOutput("grm_tuned_status"), showcase = icon("sliders"), theme = "info")
        ),
        layout_columns(
          col_widths = c(6, 6),
          card(
            card_header("Original GRM Diagnostics"),
            verbatimTextOutput("grm_diag_summary") %>% withSpinner(type = 6, color = "#0dc5c1"),
            navset_card_tab(
              # Changed to plotOutput
              nav_panel("Diagonal", plotOutput("grm_diag_plot_diag") %>% withSpinner(type = 6, color = "#0dc5c1")),
              nav_panel("Off-Diagonal", plotOutput("grm_diag_plot_offdiag") %>% withSpinner(type = 6, color = "#0dc5c1"))
            ), class = "mb-3"
          ),
          card(
            card_header("Tuned GRM Diagnostics"),
            uiOutput("tuned_diag_ui") # Conditional UI remains
          )
        ),
        card(
          card_header("GRM Heatmap (uses final GRM)"),
          plotlyOutput("grm_heatmap", height = "600px") %>% withSpinner(type = 6, color = "#0dc5c1")
        )
      ) # End page_sidebar
    ), # End nav_panel 2
    
    # Panel 3: Population Structure (PCA)
    nav_panel(
      title = "3. Population Structure (PCA)",
      value = "tab_pca",
      page_sidebar(
        sidebar = sidebar(
          title = "PCA Controls",
          width = 350,
          card(
            card_header(class = "bg-primary text-white", "PCA Parameters"),
            helpText("Ensure GRM has been calculated on Tab 2."),
            numericInput("pca_ncp", "Number of Principal Components (ncp)", value = 15, min = 2, step = 1),
            uiOutput("pca_x_axis_ui"),
            uiOutput("pca_y_axis_ui"),
            uiOutput("pca_color_col_ui"),
            actionButton("run_pca", "Run PCA", icon=icon("play"), class = "btn-success w-100 mt-3")
          )
        ), # End sidebar
        card(
          card_header("PCA Eigenvalues"),
          verbatimTextOutput("pca_eigenvalues") %>% withSpinner(type = 6, color = "#0dc5c1"),
          class="mb-3"
        ),
        layout_columns(
          col_widths = c(4, 8),
          card(
            card_header("Scree Plot"),
            plotlyOutput("pca_plot_scree") %>% withSpinner(type = 6, color = "#0dc5c1")
          ),
          card(
            card_header("PCA Scatter Plot"),
            plotlyOutput("pca_plot_pca") %>% withSpinner(type = 6, color = "#0dc5c1")
          )
        )
      ) # End page_sidebar
    ), # End nav_panel 3
    
    # Panel 4: Match Phenotypes and Download
    nav_panel(
      title = "4. Match & Download",
      value = "tab_match",
      page_sidebar(
        sidebar = sidebar(
          title = "Matching & Download Controls",
          width = 350,
          card(
            card_header(class = "bg-primary text-white", "Match GRM to Phenotype Data"),
            helpText("Ensure GRM (Tab 2) and Phenotype Data (Tab 1) are loaded."),
            uiOutput("pheno_id_col_ui"),
            uiOutput("pheno_cols_ui"),
            actionButton("run_match", "Match Data & Prepare Downloads", icon=icon("link"), class = "btn-success w-100 mt-3")
          ),
          card(
            card_header(class = "bg-primary text-white", "Download Results"),
            helpText("Downloads use the final (potentially tuned) GRM for *matched individuals*."),
            downloadButton("download_grm", "Matched GRM (.rds)", class="w-100 mb-2"),
            downloadButton("download_grm_inv", "Inverse GRM (.rds)", class="w-100 mb-2"),
            downloadButton("download_pheno_subset", "Matched Pheno Data (.csv)", class="w-100")
          )
        ), # End sidebar
        card(
          card_header("Matching Summary & Inverse GRM Preview"),
          verbatimTextOutput("match_summary") %>% withSpinner(type = 6, color = "#0dc5c1"),
          class="mb-3"
        ),
        card(
          card_header("Matched Phenotype Data Preview (Selected Columns)"),
          DTOutput("pheno_subset_preview") %>% withSpinner(type = 6, color = "#0dc5c1")
        )
      ) # End page_sidebar
    ) # End nav_panel 4
    
  ) # End navset_pill
) # End page_fluid


# --- Server Logic ---
server <- function(input, output, session) {
  
  # Reactive values to store intermediate results
  rv <- reactiveValues(
    snp_matrix_raw = NULL,
    pheno_data_raw = NULL,
    snp_preview_text = NULL,
    pheno_preview_df = NULL,
    qc_results = NULL,      # List returned by qc.filtering
    grm_original = NULL,    # Original GRM matrix
    grm_original_diag = NULL,# Diagnostics list for original GRM
    grm_final = NULL,       # Final GRM (original or tuned)
    grm_final_diag = NULL, # Diagnostics list for final GRM
    pca_results = NULL,     # List returned by kinship.pca
    matched_data_info = NULL,# List returned by match.kinship2pheno
    pheno_subset = NULL,    # Subsetted phenotype data frame
    grm_inverse = NULL      # Inverse of matched GRM (sparse)
  )
  
  # --- Reset Inputs Logic ---
  observeEvent(input$reset_inputs, {
    ids_to_reset <- c(
      "snp_file", "pheno_file", "marker_callrate", "ind_callrate", "maf",
      "heterozygosity", "Fis", "impute_qc", "grm_method", "tune_type",
      "diag_thr_small", "diag_thr_large", "duplicate_thr", "pca_ncp",
      "pheno_id_col", "pheno_cols_to_keep", "pca_x_axis", "pca_y_axis", "pca_color_col"
    )
    for (id in ids_to_reset) { shinyjs::reset(id) }
    rv_names <- names(rv); for(name in rv_names){ rv[[name]] <- NULL }
    showNotification("All inputs and results cleared.", type = "warning", duration = 4)
  })
  
  # --- Reactives for Data Loading ---
  observeEvent(input$snp_file, {
    req(input$snp_file)
    rv$snp_matrix_raw <- NULL; rv$snp_preview_text <- NULL; rv$qc_results <- NULL
    withProgress(message = 'Reading SNP data...', value = 0.3, {
      tryCatch({
        df <- read.table(input$snp_file$datapath, header = FALSE, sep = "\t", stringsAsFactors = FALSE, check.names = FALSE, comment.char = "")
        try({ preview_lines <- head(readLines(input$snp_file$datapath, n = 6)); rv$snp_preview_text <- paste(preview_lines, collapse = "\n") }, silent = TRUE)
        incProgress(0.2, detail = "Validating format...")
        validate(need(ncol(df) > 1, "SNP file needs at least an ID column and one marker column."))
        ids <- df[,1]; markers <- df[, -1, drop = FALSE]
        markers_numeric <- as.data.frame(lapply(markers, function(x) { as.numeric(as.character(x)) }))
        all_vals <- na.omit(unlist(markers_numeric))
        unexpected_vals <- setdiff(unique(all_vals), c(0, 1, 2))
        if(length(unexpected_vals) > 0) { showNotification(paste("Warning: SNP matrix contains values other than 0, 1, 2, NA (e.g.,", paste(head(unexpected_vals), collapse=", "), "). Check format."), type="warning", duration=10) }
        if (sum(is.na(markers_numeric)) / (nrow(markers_numeric) * ncol(markers_numeric)) > 0.9) { showNotification("Warning: High proportion (>90%) of marker entries became NA after numeric conversion. Check SNP file format.", type="warning", duration=10) }
        incProgress(0.3, detail = "Storing matrix...")
        rownames(markers_numeric) <- ids; rv$snp_matrix_raw <- as.matrix(markers_numeric)
        incProgress(0.2, detail = "Completed"); Sys.sleep(0.5); message("SNP matrix loaded successfully."); showNotification("SNP matrix loaded.", type = "message", duration = 3)
      }, error = function(e) { showNotification(paste("Error reading SNP file:", e$message), type = "error", duration = 10); rv$snp_matrix_raw <- NULL; rv$snp_preview_text <- NULL })
    }) # End withProgress
  })
  
  output$snp_preview <- renderText({ req(rv$snp_preview_text); rv$snp_preview_text })
  
  observeEvent(input$pheno_file, {
    req(input$pheno_file)
    rv$pheno_data_raw <- NULL; rv$pheno_preview_df <- NULL; rv$matched_data_info <- NULL; rv$pheno_subset <- NULL
    withProgress(message = 'Reading Phenotype data...', value = 0.5, {
      tryCatch({
        df <- read.csv(input$pheno_file$datapath, check.names = FALSE, stringsAsFactors = FALSE)
        rv$pheno_data_raw <- df; rv$pheno_preview_df <- head(df)
        incProgress(0.5, detail = "Completed"); Sys.sleep(0.5); message("Phenotype data loaded successfully."); showNotification("Phenotype data loaded.", type = "message", duration = 3)
      }, error = function(e) { showNotification(paste("Error reading phenotype file:", e$message), type = "error", duration = 10); rv$pheno_data_raw <- NULL; rv$pheno_preview_df <- NULL })
    }) # End withProgress
  })
  
  output$pheno_preview <- renderTable({ req(rv$pheno_preview_df); rv$pheno_preview_df }, striped = TRUE, hover = TRUE, bordered = TRUE, spacing = 'xs')
  
  output$pheno_id_col_ui <- renderUI({
    req(rv$pheno_data_raw); selectInput("pheno_id_col", "1. Select Phenotype ID Column (for matching):", choices = names(rv$pheno_data_raw), selected = names(rv$pheno_data_raw)[1])
  })
  
  output$pheno_cols_ui <- renderUI({
    req(rv$pheno_data_raw); cols <- names(rv$pheno_data_raw); default_selected <- cols
    pickerInput("pheno_cols_to_keep", "2. Select Phenotype Columns to Keep (in output):", choices = cols, selected = default_selected, multiple = TRUE, options = pickerOptions(actionsBox = TRUE, liveSearch = TRUE, size=10))
  })
  
  # --- Panel 1: QC Logic ---
  observeEvent(input$run_qc, {
    req(rv$snp_matrix_raw)
    rv$qc_results <- NULL; rv$grm_original <- NULL; rv$grm_final <- NULL; rv$pca_results <- NULL; rv$matched_data_info <- NULL
    shinyjs::disable("run_qc"); on.exit(shinyjs::enable("run_qc"), add = TRUE)
    withProgress(message = 'Running QC Filtering...', value = 0, {
      tryCatch({
        incProgress(0.1, detail = "Starting filtering...")
        M_filter <- memoized_qc_filtering(M = rv$snp_matrix_raw, base = FALSE, ref = NULL, marker.callrate = input$marker_callrate, ind.callrate = input$ind_callrate, maf = input$maf, heterozygosity = input$heterozygosity, Fis = input$Fis, impute = input$impute_qc, na.string = NA, plots = TRUE)
        incProgress(0.8, detail = "Assigning results..."); rv$qc_results <- M_filter
        incProgress(0.1, detail = "Complete!"); Sys.sleep(1); showNotification("QC Filtering Complete.", type = "message", duration = 5)
      }, error = function(e) { showNotification(paste("Error during QC:", e$message), type = "error", duration = 10); rv$qc_results <- NULL })
    }) # End withProgress
  }) # End observeEvent run_qc
  
  # QC Outputs
  output$qc_summary <- renderPrint({ req(rv$snp_matrix_raw); cat("Original Matrix Dimensions:\n"); cat(" Individuals:", nrow(rv$snp_matrix_raw), "\n"); cat(" Markers:", ncol(rv$snp_matrix_raw), "\n\n"); req(rv$qc_results); cat("Filtered Matrix Dimensions (M.clean):\n"); cat(" Individuals:", nrow(rv$qc_results$M.clean), "\n"); cat(" Markers:", ncol(rv$qc_results$M.clean), "\n\n"); cat("Summary of removed markers/individuals:\n"); print(rv$qc_results$summ) })
  
  safe_ggplotly <- function(gg_plot) {
    if (is.null(gg_plot) || !inherits(gg_plot, "ggplot")) { return(NULL) }
    tryCatch({ plotly::ggplotly(gg_plot) }, error = function(e) { warning("ggplotly conversion failed:", e$message); return(NULL) })
  }
  
  output$qc_plot_maf <- renderPlotly({ req(rv$qc_results); safe_ggplotly(rv$qc_results$plot.maf) })
  output$qc_plot_missing_ind <- renderPlotly({ req(rv$qc_results); safe_ggplotly(rv$qc_results$plot.missing.ind) })
  output$qc_plot_missing_snp <- renderPlotly({ req(rv$qc_results); safe_ggplotly(rv$qc_results$plot.missing.SNP) })
  output$qc_plot_heteroz <- renderPlotly({ req(rv$qc_results); safe_ggplotly(rv$qc_results$plot.heteroz) })
  output$qc_plot_fis <- renderPlotly({ req(rv$qc_results); safe_ggplotly(rv$qc_results$plot.Fis) })
  
  # --- Panel 2: GRM Calculation & Diagnostics Logic ---
  observeEvent(input$run_grm, {
    req(rv$qc_results, rv$qc_results$M.clean)
    rv$grm_original <- NULL; rv$grm_original_diag <- NULL; rv$grm_final <- NULL; rv$grm_final_diag <- NULL; rv$pca_results <- NULL; rv$matched_data_info <- NULL
    shinyjs::disable("run_grm"); on.exit(shinyjs::enable("run_grm"), add = TRUE)
    withProgress(message = 'Processing GRM...', value = 0, {
      tryCatch({
        n_steps <- if (input$tune_type != "None") 4 else 2
        incProgress(1/n_steps, detail = paste("Calculating G matrix (", input$grm_method, ")..."))
        G_orig_list <- memoized_G_matrix(M = rv$qc_results$M.clean, method = input$grm_method, na.string = NA); G_orig <- G_orig_list$G; rv$grm_original <- G_orig; message("Original GRM calculated.")
        incProgress(1/n_steps, detail = "Running initial diagnostics...")
        diag_orig <- memoized_kinship_diag(K = G_orig, diagonal.thr.small = input$diag_thr_small, diagonal.thr.large = input$diag_thr_large, duplicate.thr = input$duplicate_thr); rv$grm_original_diag <- diag_orig; message("Original GRM diagnostics complete.")
        if (input$tune_type == "Bend") {
          incProgress(1/n_steps, detail = "Tuning GRM (Bending)..."); G_tuned_result <- memoized_G_tuneup(G = G_orig, bend = TRUE, blend = FALSE); rv$grm_final <- G_tuned_result$Gb; message("GRM Tuning (Bend) complete.")
        } else if (input$tune_type == "Blend") {
          incProgress(1/n_steps, detail = "Tuning GRM (Blending)..."); G_tuned_result <- memoized_G_tuneup(G = G_orig, bend = FALSE, blend = TRUE); rv$grm_final <- G_tuned_result$Gb; message("GRM Tuning (Blend) complete.")
        } else { rv$grm_final <- rv$grm_original; message("Skipping GRM tuning.") }
        if (input$tune_type != "None") {
          incProgress(1/n_steps, detail = "Running diagnostics on tuned GRM..."); diag_tuned <- memoized_kinship_diag(K = rv$grm_final, diagonal.thr.small = input$diag_thr_small, diagonal.thr.large = input$diag_thr_large, duplicate.thr = input$duplicate_thr); rv$grm_final_diag <- diag_tuned; message("Tuned GRM diagnostics complete.")
        } else { rv$grm_final_diag <- rv$grm_original_diag }
        Sys.sleep(1); showNotification("GRM calculation and diagnostics complete.", type = "message", duration = 5)
      }, error = function(e) { showNotification(paste("Error during GRM calculation/diagnostics:", e$message), type = "error", duration = 10); rv$grm_original <- NULL; rv$grm_original_diag <- NULL; rv$grm_final <- NULL; rv$grm_final_diag <- NULL })
    }) # End withProgress
  }) # End observeEvent run_grm
  
  # GRM Value Box Outputs
  output$grm_original_dims <- renderText({ req(rv$grm_original); paste(nrow(rv$grm_original), "x", ncol(rv$grm_original)) })
  output$grm_tuned_status <- renderText({ req(rv$grm_final); input$tune_type })
  
  # GRM Diagnostic Outputs (Using renderPlot for diag plots)
  output$grm_diag_summary <- renderPrint({ req(rv$grm_original_diag); cat("--- Original GRM Diagnostics ---\n"); print(rv$grm_original_diag$stats); cat("\nExtreme Diagonal Values (Count):", length(rv$grm_original_diag$list.diagonal), "\n"); cat("\nPotential Duplicates (Count):", length(rv$grm_original_diag$list.duplicate), "\n"); })
  output$grm_diag_plot_diag <- renderPlot({ req(rv$grm_original_diag$plot.diag); print(rv$grm_original_diag$plot.diag) }) # Changed to renderPlot
  output$grm_diag_plot_offdiag <- renderPlot({ req(rv$grm_original_diag$plot.offdiag); print(rv$grm_original_diag$plot.offdiag) }) # Changed to renderPlot
  
  # Conditional UI for Tuned Diagnostics
  output$tuned_diag_ui <- renderUI({
    req(rv$grm_final_diag)
    if (input$tune_type != "None" && !is.null(rv$grm_final_diag) && !identical(rv$grm_final_diag, rv$grm_original_diag)) {
      tagList(
        verbatimTextOutput("grm_tuned_diag_summary") %>% withSpinner(type = 6, color = "#0dc5c1"),
        navset_card_tab(
          # Changed to plotOutput
          nav_panel("Diagonal", plotOutput("grm_tuned_diag_plot_diag") %>% withSpinner(type = 6, color = "#0dc5c1")),
          nav_panel("Off-Diagonal", plotOutput("grm_tuned_diag_plot_offdiag") %>% withSpinner(type = 6, color = "#0dc5c1"))
        )
      )
    } else if (input$tune_type != "None") { helpText("Tuning selected, but diagnostics failed or are identical to original.") }
    else { helpText("Tuning was set to 'None'.") }
  })
  
  # Tuned Diagnostics Outputs (rendered inside the conditional UI, using renderPlot)
  output$grm_tuned_diag_summary <- renderPrint({ cat(paste("--- Tuned GRM Diagnostics (Method:", input$tune_type, ") ---\n")); print(rv$grm_final_diag$stats); cat("\nExtreme Diagonal Values (Count):", length(rv$grm_final_diag$list.diagonal), "\n"); cat("\nPotential Duplicates (Count):", length(rv$grm_final_diag$list.duplicate), "\n"); })
  output$grm_tuned_diag_plot_diag <- renderPlot({ print(rv$grm_final_diag$plot.diag) }) # Changed to renderPlot
  output$grm_tuned_diag_plot_offdiag <- renderPlot({ print(rv$grm_final_diag$plot.offdiag) }) # Changed to renderPlot
  
  # Heatmap Output using heatmaply
  output$grm_heatmap <- renderPlotly({
    req(rv$grm_final); showNotification("Generating heatmap (may take time for large matrices)...", type="message", duration=3)
    tryCatch({ heatmaply(rv$grm_final, showticklabels = c(FALSE, FALSE), scale = "none", colors = viridis::viridis(256), show_dendrogram = c(TRUE, TRUE))
    }, error = function(e){ showNotification(paste("Heatmap Error:", e$message), type="warning", duration=10); plotly_empty(type = "scatter", mode = "markers") %>% layout(title = "Error generating heatmap") })
  })
  
  # --- Panel 3: PCA Logic ---
  observeEvent(input$run_pca, {
    req(rv$grm_final)
    rv$pca_results <- NULL; rv$matched_data_info <- NULL # Clear relevant downstream results
    shinyjs::disable("run_pca"); on.exit(shinyjs::enable("run_pca"), add = TRUE)
    withProgress(message = 'Running PCA...', value = 0, {
      tryCatch({
        incProgress(0.2, detail = "Starting PCA calculation..."); pca_res <- memoized_kinship_pca(K = rv$grm_final, ncp = input$pca_ncp)
        incProgress(0.6, detail = "Assigning results..."); rv$pca_results <- pca_res
        incProgress(0.2, detail = "Complete!"); Sys.sleep(1); showNotification("PCA Complete.", type = "message", duration = 5)
      }, error = function(e) { showNotification(paste("Error during PCA:", e$message), type = "error", duration = 10); rv$pca_results <- NULL })
    }) # End withProgress
  }) # End observeEvent run_pca
  
  # Dynamic UI for PCA axis selection
  output$pca_x_axis_ui <- renderUI({ req(rv$pca_results$pca.scores); pcs <- colnames(rv$pca_results$pca.scores); selectInput("pca_x_axis", "Select X-axis PC:", choices = pcs, selected = pcs[1]) })
  output$pca_y_axis_ui <- renderUI({ req(rv$pca_results$pca.scores); pcs <- colnames(rv$pca_results$pca.scores); selected_y <- if(length(pcs) > 1) pcs[2] else pcs[1]; selectInput("pca_y_axis", "Select Y-axis PC:", choices = pcs, selected = selected_y) })
  output$pca_color_col_ui <- renderUI({
    req(rv$pheno_subset, input$pheno_id_col); potential_cols <- setdiff(names(rv$pheno_subset), input$pheno_id_col)
    suggested_cols <- Filter(function(colname) { col_data <- rv$pheno_subset[[colname]]; is.character(col_data) || is.factor(col_data) || (is.numeric(col_data) && length(unique(na.omit(col_data))) < 15) }, potential_cols)
    choices_list <- c("None" = "", suggested_cols); other_cols <- setdiff(potential_cols, suggested_cols)
    if (length(other_cols) > 0) { choices_list <- c(choices_list, list("Other Columns" = other_cols)) }
    selectInput("pca_color_col", "Color points by Pheno Column (Optional):", choices = choices_list, selected = "")
  })
  
  # PCA Outputs
  output$pca_eigenvalues <- renderPrint({ req(rv$pca_results); cat("Eigenvalues and Variance Explained:\n"); print(rv$pca_results$eigenvalues) })
  output$pca_plot_scree <- renderPlotly({ req(rv$pca_results); safe_ggplotly(rv$pca_results$plot.scree) })
  output$pca_plot_pca <- renderPlotly({
    req(rv$pca_results$pca.scores, input$pca_x_axis, input$pca_y_axis)
    validate(need(input$pca_x_axis %in% colnames(rv$pca_results$pca.scores), "Selected X-axis PC not found."), need(input$pca_y_axis %in% colnames(rv$pca_results$pca.scores), "Selected Y-axis PC not found."))
    pca_scores_df <- as.data.frame(rv$pca_results$pca.scores) %>% rownames_to_column(var = ".pca_id_col")
    color_col_name <- input$pca_color_col; plot_data <- pca_scores_df; color_mapping_active <- FALSE; legend_title <- ""
    if (!is.null(color_col_name) && nzchar(color_col_name) && !is.null(rv$pheno_subset)) {
      if(color_col_name %in% names(rv$pheno_subset)) {
        id_col_name <- input$pheno_id_col
        if (id_col_name %in% names(rv$pheno_subset)) {
          pheno_color_data <- rv$pheno_subset[, c(id_col_name, color_col_name), drop = FALSE]; pheno_color_data[[id_col_name]] <- as.character(pheno_color_data[[id_col_name]])
          plot_data <- dplyr::left_join(pca_scores_df, pheno_color_data, by = setNames(id_col_name, ".pca_id_col"))
          if(color_col_name %in% names(plot_data) && !all(is.na(plot_data[[color_col_name]]))) { color_mapping_active <- TRUE; legend_title <- color_col_name } else { warning("Join for PCA color failed or resulted in all NAs.") }
        } else { warning("ID column '", id_col_name, "' not found in subsetted phenotype data for PCA coloring.") }
      } else { warning("Selected color column '", color_col_name, "' not found in subsetted phenotype data.") }
    }
    p <- ggplot(plot_data, aes(x = .data[[input$pca_x_axis]], y = .data[[input$pca_y_axis]]))
    if (color_mapping_active) {
      p <- p + geom_point(aes(color = factor(.data[[color_col_name]]), text = paste("ID:", .data$.pca_id_col, "<br>", legend_title, ":", .data[[color_col_name]])), alpha = 0.7, shape = 16) + labs(color = legend_title)
    } else { p <- p + geom_point(aes(text = paste("ID:", .data$.pca_id_col)), alpha = 0.7, shape = 16) }
    p <- p + theme_minimal() + labs(title = paste("PCA Plot:", input$pca_x_axis, "vs", input$pca_y_axis), x = input$pca_x_axis, y = input$pca_y_axis) + theme(plot.title = element_text(hjust = 0.5))
    ggplotly(p, tooltip = "text")
  })
  
  # --- Panel 4: Match Phenotypes and Download Logic ---
  observeEvent(input$run_match, {
    req(rv$grm_final, rv$pheno_data_raw, input$pheno_id_col, input$pheno_cols_to_keep)
    rv$matched_data_info <- NULL; rv$pheno_subset <- NULL; rv$grm_inverse <- NULL
    shinyjs::disable("run_match"); on.exit(shinyjs::enable("run_match"), add = TRUE)
    withProgress(message = 'Preparing Data...', value = 0, {
      tryCatch({
        incProgress(0.1, detail = "Checking inputs...")
        if (!input$pheno_id_col %in% names(rv$pheno_data_raw)) stop(paste("Selected Phenotype ID column '", input$pheno_id_col, "' not found."))
        if (is.null(input$pheno_cols_to_keep) || length(input$pheno_cols_to_keep) == 0) stop("Please select at least one phenotype column to keep.")
        if (!all(input$pheno_cols_to_keep %in% names(rv$pheno_data_raw))) warning("Some selected 'columns to keep' were not found in the phenotype data.")
        incProgress(0.2, detail = "Matching GRM to Phenotypes...")
        matched_info <- memoized_match_kinship2pheno(K = rv$grm_final, pheno.data = rv$pheno_data_raw, indiv = input$pheno_id_col, clean = FALSE, mism = TRUE); rv$matched_data_info <- matched_info
        incProgress(0.2, detail = "Subsetting phenotype data...")
        pheno_subset_rows <- rv$pheno_data_raw[matched_info$matchesP, , drop = FALSE]; cols_to_keep_final <- unique(c(input$pheno_id_col, input$pheno_cols_to_keep)); cols_to_keep_final <- cols_to_keep_final[cols_to_keep_final %in% names(pheno_subset_rows)]; validate(need(length(cols_to_keep_final) > 0, "No valid columns selected or found to keep."))
        pheno_subset_final <- pheno_subset_rows[, cols_to_keep_final, drop = FALSE]; pheno_subset_final[[input$pheno_id_col]] <- factor(pheno_subset_final[[input$pheno_id_col]]); rv$pheno_subset <- pheno_subset_final; message("Phenotype subset created.")
        incProgress(0.3, detail = "Calculating Inverse GRM...")
        grm_matched <- rv$grm_final[matched_info$matchesK, matched_info$matchesK]; if(nrow(grm_matched) == 0) stop("No individuals matched between GRM and Phenotypes."); if(any(!is.finite(grm_matched))) stop("Non-finite values found in the matched GRM before inversion.")
        Ginv_sparse_list <- memoized_G_inverse(G = grm_matched, sparseform = TRUE); rv$grm_inverse <- Ginv_sparse_list$Ginv; message("Inverse GRM calculated.")
        incProgress(0.2, detail = "Complete!"); Sys.sleep(1); showNotification("Matching and Inverse Calculation Complete. Ready for Download.", type = "message", duration = 5)
      }, error = function(e) { showNotification(paste("Error during matching or inverse calculation:", e$message), type = "error", duration = 10); rv$matched_data_info <- NULL; rv$pheno_subset <- NULL; rv$grm_inverse <- NULL })
    }) # End withProgress
  }) # End observeEvent run_match
  
  # Match/Download Outputs
  output$match_summary <- renderPrint({
    req(rv$matched_data_info); cat("--- Matching Summary ---\n"); cat("Kinship matrix individuals NOT in Phenotypes:", length(rv$matched_data_info$mismatchesK), "\n"); cat("Kinship matrix individuals MATCHING Phenotypes:", length(rv$matched_data_info$matchesK), "\n"); cat("Phenotype individuals NOT in Kinship matrix:", length(rv$matched_data_info$mismatchesP), "\n"); cat("Phenotype individuals MATCHING Kinship matrix:", length(rv$matched_data_info$matchesP), "\n"); req(rv$grm_inverse); cat("\n--- Inverse GRM Summary ---\n"); cat("Inverse GRM calculated for", length(rv$matched_data_info$matchesK), "matched individuals.\n"); cat("Format: Sparse Matrix (row, column, value)\n"); cat("Preview (first 6 rows):\n")
    tryCatch({ if (inherits(rv$grm_inverse, "dgTMatrix") || is.data.frame(rv$grm_inverse) || is.matrix(rv$grm_inverse)) { print(head(rv$grm_inverse)) } else { cat("Preview not available for this format.\n") } }, error = function(e) { cat("Could not generate preview for inverse GRM.\n")})
  })
  output$pheno_subset_preview <- renderDT({ req(rv$pheno_subset); datatable(rv$pheno_subset, options = list(pageLength = 5, scrollX = TRUE, searching = FALSE), rownames = FALSE) })
  
  # Download Handlers
  output$download_grm <- downloadHandler(
    filename = function() { paste0("grm_matched_", input$grm_method, "_", input$tune_type, ".rds") },
    content = function(file) { req(rv$grm_final, rv$matched_data_info); grm_to_save <- rv$grm_final[rv$matched_data_info$matchesK, rv$matched_data_info$matchesK]; validate(need(nrow(grm_to_save) > 0, "No matched individuals found to save GRM.")); saveRDS(grm_to_save, file = file) }
  )
  output$download_grm_inv <- downloadHandler(
    filename = function() { paste0("grm_inverse_", input$grm_method, "_", input$tune_type, ".rds") },
    content = function(file) { req(rv$grm_inverse); saveRDS(rv$grm_inverse, file = file) }
  )
  output$download_pheno_subset <- downloadHandler(
    filename = function() { "phenotype_subset_matched.csv" },
    content = function(file) { req(rv$pheno_subset); write.csv(rv$pheno_subset, file = file, row.names = FALSE, quote = FALSE) }
  )
  
} # End Server

# Run the application
shinyApp(ui = ui, server = server)
