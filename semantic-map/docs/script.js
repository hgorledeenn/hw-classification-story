// Global variables
let clusterKey = 'cluster'; // overridden to 'cluster_label' if that column exists
let svg;
let dotsGroup;
let zoom;
let currentTransform = d3.zoomIdentity;
let colorScale;
let clusterColorScale;
let xScale, yScale, allData;
let searchTerm = '';
let dateSlider;
let isInitialLoad = true;
let selectedSources = [];
let selectedClusters = [];
let coloringMode = 'source'; // or 'cluster'
let networkColorScale;
let sizeScale;
let hasAmountColumn = false;

// LLM overlay variables
let llmOverlayEnabled = false;
let llmOverlayOpacity = 0.6;
let llmLabelMap = {}; // title → true/false

// Dot size multiplier
let dotSizeMultiplier = 1.0;

// Highlight style overrides (apply to active/highlighted points)
let highlightColorOverride = null;  // null = use default color scale
let highlightSizeMultiplier = 1.0;
let highlightOpacity = 0.7;
let highlightAlwaysBorder = false;
let highlightBorderColor = '#000000';
let highlightBorderWidth = 1;

// Canvas and context variables
let canvas;
let ctx;
let boundingRect;
let hoveredPoint = null;
let isMouseInCanvas = false;

// Add these variables with other global variables at the top
let isPlaying = false;
let playbackInterval = null;

// DOM element references
const loadingContainer = document.getElementById('loading-container');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const mainContent = document.querySelectorAll('#controls-container, #content-container');
const mainContainer = document.getElementById('main-container');
const scatterPlotDiv = d3.select("#scatter-plot");

// Constants
const MAX_WIDTH = 1200;
const padding = { top: 20, right: 20, bottom: 30, left: 40 };
// S3 bucket URL
const DEFAULT_FILE_PATH = "https://dhrumil-public.s3.us-west-2.amazonaws.com/";

// Get LLM labels file URL from URL parameters
function getLLMFileFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('llmfile'); // returns null if not present
}

async function loadLLMLabels(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const data = d3.csvParse(text);
        const map = {};
        data.forEach(d => {
            if (d.Title !== undefined && d.llm !== undefined) {
                map[d.Title.trim()] = d.llm.trim() === 'True';
            }
        });
        return map;
    } catch (err) {
        console.warn('Could not load LLM labels:', err);
        return {};
    }
}

// Get file path from URL parameters
function getFilenameFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const filename = urlParams.get('filename');
    const localfile = urlParams.get('localfile');
    const outputfile = urlParams.get('outputfile');
    
    // Error if multiple parameters are provided
    if ((filename && localfile) || (filename && outputfile) || (localfile && outputfile)) {
        throw new Error('Multiple file parameters provided. Please use only one: filename, localfile, or outputfile.');
    }
    
    // Use output directory file if provided
    if (outputfile) {
        return '../output/' + outputfile;
    }
    
    // Use local file if provided
    if (localfile) {
        return localfile;
    }
    
    // Use S3 file if filename is provided
    if (filename) {
        return DEFAULT_FILE_PATH + filename;
    }
    
    // Default to bundled public data when no parameter is provided
    return 'data.csv';
}

// Process data
const parseDate = d3.timeParse("%Y-%m-%d");
const formatDate = d3.timeFormat("%a %Y-%m-%d");

// Data loading functions
async function loadData(url) {
    try {
        const response = await fetch(url);
        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');

        let receivedLength = 0;
        let chunks = [];
        
        while(true) {
            const {done, value} = await reader.read();
            
            if (done) {
                break;
            }
            
            chunks.push(value);
            receivedLength += value.length;
            
            // Update progress
            const progress = (receivedLength / contentLength) * 100;
            progressBar.style.width = progress + '%';
            progressText.textContent = progress.toFixed(1) + '%';
        }

        // Concatenate chunks into single Uint8Array
        let chunksAll = new Uint8Array(receivedLength);
        let position = 0;
        for(let chunk of chunks) {
            chunksAll.set(chunk, position);
            position += chunk.length;
        }

        // Convert to text
        const text = new TextDecoder("utf-8").decode(chunksAll);
        
        // Parse CSV
        const data = d3.csvParse(text);
        
        return data;
    } catch (err) {
        console.error('Error loading data:', err);
        loadingContainer.innerHTML = `
            <div class="loading-text" style="color: red;">
                Error loading data. Please try refreshing the page.
            </div>`;
    }
}

async function showMainContent(data) {
    loadingContainer.style.display = 'none';
    mainContainer.style.visibility = 'visible';
    return data;
}

// update filename
function updateDescription() {
    const urlParams = new URLSearchParams(window.location.search);
    const filename = urlParams.get('filename');
    const localfile = urlParams.get('localfile');
    const outputfile = urlParams.get('outputfile');
    
    const fileToShow = outputfile || localfile || filename;
    
    const description = document.getElementById('description');
    if (description) {
        description.innerHTML = `This is a "semantic map" of poems in <strong>${fileToShow}</strong>.`;
    }
}

// URL and parameter handling functions
function updateURL(searchTerm, startDate, endDate) {
    // Get current URL parameters
    const params = new URLSearchParams(window.location.search);
    
    // Always preserve filename, localfile, or outputfile
    const filename = params.get('filename');
    const localfile = params.get('localfile');
    const outputfile = params.get('outputfile');
    
    // Create new params object
    const newParams = new URLSearchParams();
    
    // Set file parameter if it exists
    if (filename) {
        newParams.set('filename', filename);
    }
    if (localfile) {
        newParams.set('localfile', localfile);
    }
    if (outputfile) {
        newParams.set('outputfile', outputfile);
    }
    
    // Always set all filter parameters, even if empty
    newParams.set('search', searchTerm || '');
    newParams.set('start', startDate ? formatDate(startDate) : '');
    newParams.set('end', endDate ? formatDate(endDate) : '');

    // Persist filter selections and coloring mode
    if (selectedSources.length > 0) newParams.set('sources', selectedSources.join(','));
    if (selectedClusters.length > 0) newParams.set('clusters', selectedClusters.join(','));
    if (coloringMode !== 'source') newParams.set('coloring', coloringMode);

    // Update URL without reloading page
    const newURL = `${window.location.pathname}?${newParams.toString()}`;
    history.pushState(null, '', newURL);
}

function readURLParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        searchTerm: params.get('search') || '',
        start: params.get('start') ? new Date(params.get('start')) : null,
        end: params.get('end') ? new Date(params.get('end')) : null,
        sources: params.get('sources') ? params.get('sources').split(',').filter(Boolean) : [],
        clusters: params.get('clusters') ? params.get('clusters').split(',').filter(Boolean) : [],
        coloring: params.get('coloring') || 'source',
    };
}

// Replace setupSVG with setupCanvas
function setupCanvas() {
    const scatterPlotDiv = d3.select("#scatter-plot");
    
    // Create canvas element
    canvas = scatterPlotDiv.append("canvas")
        .style("width", "100%")
        .style("height", "100%")
        .node();

    // Get context and set initial transform
    ctx = canvas.getContext('2d');
    
    // Set canvas size with higher resolution for retina displays
    const pixelRatio = window.devicePixelRatio || 1;
    boundingRect = canvas.getBoundingClientRect();
    canvas.width = boundingRect.width * pixelRatio;
    canvas.height = boundingRect.height * pixelRatio;
    ctx.scale(pixelRatio, pixelRatio);

    // Initialize zoom behavior
    zoom = d3.zoom()
        .scaleExtent([0.5, 20])
        .on("zoom", handleZoom);

    // Apply zoom behavior to canvas
    d3.select(canvas).call(zoom)
        .on("dblclick.zoom", null)
        .on("mousemove", handleCanvasMouseMove)
        .on("mouseout", handleCanvasMouseOut)
        .on("click", handleCanvasClick);

    setupZoomControls();
}

// Replace handleZoom
function handleZoom(event) {
    currentTransform = event.transform;
    drawCanvas();
}

// New function to draw everything on canvas
function drawCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;
    
    // Clear the entire canvas using actual dimensions
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    // Apply zoom transform scaled by pixel ratio
    ctx.save();
    ctx.setTransform(
        currentTransform.k * pixelRatio, 0, 0,
        currentTransform.k * pixelRatio,
        currentTransform.x * pixelRatio,
        currentTransform.y * pixelRatio
    );
    
    // First pass: Draw inactive points
    allData.forEach(d => {
        if (isPointActive(d)) return; // Skip active points in first pass

        const baseRadius = (hasAmountColumn ? sizeScale(d.amount) : 5) * dotSizeMultiplier;
        const radius = baseRadius / currentTransform.k;

        ctx.beginPath();
        ctx.arc(
            xScale(d.x),
            yScale(d.y),
            radius,
            0,
            2 * Math.PI
        );

        ctx.fillStyle = '#cccccc';
        ctx.globalAlpha = 0.1;
        ctx.fill();
    });

    // Second pass: Draw active points
    allData.forEach(d => {
        if (!isPointActive(d)) return; // Skip inactive points in second pass

        const baseRadius = (hasAmountColumn ? sizeScale(d.amount) : 5) * dotSizeMultiplier * highlightSizeMultiplier;
        const radius = baseRadius / currentTransform.k;

        ctx.beginPath();
        ctx.arc(
            xScale(d.x),
            yScale(d.y),
            d === hoveredPoint ? radius * 2 : radius,
            0,
            2 * Math.PI
        );

        ctx.fillStyle = highlightColorOverride || getColor(d, true);
        ctx.globalAlpha = highlightOpacity;

        if (d === hoveredPoint || highlightAlwaysBorder) {
            ctx.strokeStyle = highlightBorderColor;
            ctx.lineWidth = highlightBorderWidth / currentTransform.k;
            ctx.stroke();
        }

        ctx.fill();
    });

    // Third pass: LLM overlay (drawn on top of active points when enabled)
    if (llmOverlayEnabled && Object.keys(llmLabelMap).length > 0) {
        allData.forEach(d => {
            if (!isPointActive(d)) return;
            const llmValue = llmLabelMap[d.title];
            if (llmValue === undefined) return;

            const baseRadius = (hasAmountColumn ? sizeScale(d.amount) : 5) * dotSizeMultiplier;
            const radius = baseRadius / currentTransform.k;

            ctx.beginPath();
            ctx.arc(
                xScale(d.x),
                yScale(d.y),
                d === hoveredPoint ? radius * 2 : radius,
                0,
                2 * Math.PI
            );
            ctx.fillStyle = llmValue ? '#ff8c00' : '#6a5acd';
            ctx.globalAlpha = llmOverlayOpacity;
            ctx.fill();
        });
    }

    ctx.restore();
}

// New helper function to check if point is active
function isPointActive(d) {
    const dateValues = dateSlider.get().map(v => new Date(+v));
    const filterMatch = coloringMode === 'cluster'
        ? (selectedClusters.length === 0 || selectedClusters.includes(d[clusterKey]))
        : (selectedSources.length === 0 || selectedSources.includes(d.source));
    return d.date >= dateValues[0] &&
           d.date <= dateValues[1] &&
           filterMatch &&
           (searchTerm === '' ||
            d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.text.toLowerCase().includes(searchTerm.toLowerCase()));
}

// New mouse interaction handlers
function handleCanvasMouseMove(event) {
    const mouseX = (event.offsetX - currentTransform.x) / currentTransform.k;
    const mouseY = (event.offsetY - currentTransform.y) / currentTransform.k;
    
    // Find nearest point within certain radius (constant screen size)
    const radius = 5 / currentTransform.k;
    let closest = null;
    let minDistance = radius;

    allData.forEach(d => {
        if (!isPointActive(d)) return;
        
        const dx = xScale(d.x) - mouseX;
        const dy = yScale(d.y) - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minDistance) {
            minDistance = distance;
            closest = d;
        }
    });

    if (closest !== hoveredPoint) {
        hoveredPoint = closest;
        drawCanvas();
        
        if (hoveredPoint) {
            // Update info box similar to original handleMouseOver
            const clusterDisplay = hoveredPoint[clusterKey]
                ? `<br/><strong>Cluster:</strong> ${hoveredPoint[clusterKey]}`
                : '';
            const infoText = `<strong>Title:</strong> ${highlightText(hoveredPoint.title, searchTerm)}
                            ${hasAmountColumn ? `<br/><strong>Amount:</strong> ${hoveredPoint.amount.toLocaleString()}` : ''}
                            <br/><strong>Date:</strong> ${formatDate(hoveredPoint.date)}
                            <br/><strong>Author:</strong> ${hoveredPoint.author}
                            ${clusterDisplay}
                            <br/><strong>Source:</strong> <a href="${hoveredPoint.url}" target="_blank">${hoveredPoint.url}</a>`;
            d3.select("#info-box").html(infoText);
        }
    }
}

function handleCanvasMouseOut() {
    hoveredPoint = null;
    drawCanvas();
}

function handleCanvasClick(event) {
    if (hoveredPoint && isPointActive(hoveredPoint)) {
        const source = hoveredPoint.url || "#§" + hoveredPoint.title.replace(/\s+/g, '-').toLowerCase();
        window.open(source, "_blank");
    }
}

function setupZoomControls() {
    d3.select("#zoom-in").on("click", () => {
        d3.select(canvas).transition()
            .duration(300)
            .call(zoom.scaleBy, 1.5);
    });

    d3.select("#zoom-out").on("click", () => {
        d3.select(canvas).transition()
            .duration(300)
            .call(zoom.scaleBy, 0.75);
    });

    d3.select("#zoom-reset").on("click", () => {
        d3.select(canvas).transition()
            .duration(300)
            .call(zoom.transform, d3.zoomIdentity);
    });
}

function updatePlotSize() {
    const boundingRect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = boundingRect.width * pixelRatio;
    canvas.height = boundingRect.height * pixelRatio;
    
    ctx.scale(pixelRatio, pixelRatio);
    
    const width = Math.min(boundingRect.width, MAX_WIDTH) - padding.left - padding.right;
    const height = Math.min(boundingRect.width, MAX_WIDTH) - padding.top - padding.bottom;

    xScale.range([0, width]);
    yScale.range([height, 0]);

    drawCanvas();
}

// Setup functions
function setupFilterCombobox(options, getColor, selectedArray, onUpdate, initialValues = []) {
    const tagsEl    = document.getElementById('filter-tags');
    const inputEl   = document.getElementById('filter-input');
    const dropdownEl = document.getElementById('filter-dropdown');

    // clear previous state
    tagsEl.innerHTML = '';
    inputEl.value = '';
    dropdownEl.innerHTML = '';
    dropdownEl.classList.remove('open');
    selectedArray.length = 0;

    const placeholder = coloringMode === 'cluster' ? 'Filter by cluster...' : 'Filter by poet...';
    inputEl.placeholder = placeholder;

    function addTag(value) {
        if (selectedArray.includes(value)) return;
        selectedArray.push(value);

        const tag = document.createElement('span');
        tag.className = 'filter-tag';
        tag.style.backgroundColor = getColor(value);
        tag.textContent = value;

        const remove = document.createElement('button');
        remove.className = 'filter-tag-remove';
        remove.textContent = '×';
        remove.onclick = () => {
            const idx = selectedArray.indexOf(value);
            if (idx !== -1) selectedArray.splice(idx, 1);
            tag.remove();
            refreshDropdown(inputEl.value);
            triggerUpdate();
        };
        tag.appendChild(remove);
        tagsEl.appendChild(tag);
        triggerUpdate();
    }

    function refreshDropdown(query) {
        dropdownEl.innerHTML = '';
        const q = query.toLowerCase();
        const filtered = options.filter(o =>
            String(o).toLowerCase().includes(q) && !selectedArray.includes(o)
        );
        if (filtered.length === 0) {
            dropdownEl.classList.remove('open');
            return;
        }
        filtered.slice(0, 50).forEach(opt => {
            const li = document.createElement('li');
            li.textContent = opt;
            li.style.borderLeftColor = getColor(opt);
            li.onclick = () => {
                addTag(opt);
                inputEl.value = '';
                dropdownEl.classList.remove('open');
            };
            dropdownEl.appendChild(li);
        });
        dropdownEl.classList.add('open');
    }

    function triggerUpdate() {
        if (!dateSlider) return;
        const dateValues = dateSlider.get().map(d => new Date(+d));
        updatePlot(dateValues[0], dateValues[1], searchTerm);
        updateURL(searchTerm, dateValues[0], dateValues[1]);
    }

    // replace old listeners by cloning the input
    const newInput = inputEl.cloneNode(true);
    inputEl.parentNode.replaceChild(newInput, inputEl);
    const inp = document.getElementById('filter-input');

    inp.addEventListener('input', () => refreshDropdown(inp.value));
    inp.addEventListener('focus', () => { if (inp.value === '') refreshDropdown(''); });
    document.addEventListener('click', e => {
        if (!e.target.closest('#filter-combobox')) {
            dropdownEl.classList.remove('open');
        }
    }, { capture: true });

    // Restore pre-selected values from URL
    initialValues.forEach(v => { if (options.includes(v)) addTag(v); });
}

function setupSourceButtons(uniqueSources) {
    const { sources } = readURLParams();
    setupFilterCombobox(uniqueSources, s => colorScale(s), selectedSources, () => {}, sources);
}

function setupClusterButtons(uniqueClusters) {
    const { clusters } = readURLParams();
    setupFilterCombobox(uniqueClusters, c => clusterColorScale(c), selectedClusters, () => {}, clusters);
}

function setupDateSlider() {
    const dateExtent = d3.extent(allData, d => d.date);
    const slider = document.getElementById('date-slider');
    
    // Read URL parameters first
    const { start: urlStart, end: urlEnd } = readURLParams();
    
    // Only calculate default dates if URL params don't exist
    let startDate, endDate;
    if (urlStart && urlEnd) {
        startDate = urlStart;
        endDate = urlEnd;
    } else {
        // Default to the full date range if no URL params
        startDate = dateExtent[0]; // First date in the dataset
        endDate = dateExtent[1];   // Last date in the dataset
    }

    dateSlider = noUiSlider.create(slider, {
        start: [startDate.getTime(), endDate.getTime()],
        connect: true,
        behaviour: 'drag',
        range: {
            'min': dateExtent[0].getTime(),
            'max': dateExtent[1].getTime()
        },
        step: 24 * 60 * 60 * 1000, // One day
    });

    // Update date display and URL
    function updateDateDisplay(values) {
        const dateValues = values.map(d => new Date(+d));
        document.getElementById('start-date').textContent = formatDate(dateValues[0]);
        document.getElementById('end-date').textContent = formatDate(dateValues[1]);
        updatePlot(dateValues[0], dateValues[1], searchTerm);
        
        // Always update URL when dates change
        updateURL(searchTerm, dateValues[0], dateValues[1]);
    }

    dateSlider.on('update', updateDateDisplay);
    
    // Set initial search term
    document.getElementById('search-box').value = searchTerm;
}

// Add this function after setupDateSlider
function setupPlaybackControls() {
    const playPauseButton = document.getElementById('play-pause');
    const stepBackwardButton = document.getElementById('step-backward');
    const stepForwardButton = document.getElementById('step-forward');
    const stepBackwardWeekButton = document.getElementById('step-backward-week');
    const stepForwardWeekButton = document.getElementById('step-forward-week');

    function stepDates(days) {
        const currentDates = dateSlider.get().map(d => new Date(+d));
        const newStart = new Date(currentDates[0].setDate(currentDates[0].getDate() + days));
        const newEnd = new Date(currentDates[1].setDate(currentDates[1].getDate() + days));
        
        // Check if we're within the data bounds
        const dateExtent = d3.extent(allData, d => d.date);
        if (newEnd <= dateExtent[1] && newStart >= dateExtent[0]) {
            dateSlider.set([newStart.getTime(), newEnd.getTime()]);
        }
    }

    function togglePlayPause() {
        isPlaying = !isPlaying;
        playPauseButton.textContent = isPlaying ? '⏸' : '▶';
        
        if (isPlaying) {
            playbackInterval = setInterval(() => stepDates(1), 100); // Move forward every second
        } else {
            clearInterval(playbackInterval);
        }
    }

    playPauseButton.addEventListener('click', togglePlayPause);
    stepBackwardButton.addEventListener('click', () => stepDates(-1));
    stepForwardButton.addEventListener('click', () => stepDates(1));
    stepBackwardWeekButton.addEventListener('click', () => stepDates(-7));
    stepForwardWeekButton.addEventListener('click', () => stepDates(7));

    // Stop playback when user manually interacts with the slider
    dateSlider.on('slide', () => {
        if (isPlaying) {
            togglePlayPause();
        }
    });
}

function setupSearchControls() {
    const searchBox = document.getElementById('search-box');
    const searchButton = document.getElementById('search-button');
    const resetButton = document.getElementById('reset-button');

    searchButton.addEventListener('click', performSearch);
    searchBox.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            performSearch();
        }
    });
    resetButton.addEventListener('click', resetVisualization);
}

document.querySelectorAll('input[name="color-by"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        coloringMode = e.target.value;
        if (coloringMode === 'cluster') {
            setupClusterButtons([...new Set(allData.map(d => d[clusterKey]))].filter(Boolean).sort((a, b) => {
                const na = +a, nb = +b;
                return isNaN(na) ? a.localeCompare(b) : na - nb;
            }));
        } else {
            setupSourceButtons([...new Set(allData.map(d => d.source))]);
        }
        const dateValues = dateSlider.get().map(d => new Date(+d));
        updatePlot(dateValues[0], dateValues[1], searchTerm);
        updateURL(searchTerm, dateValues[0], dateValues[1]);
    });
});

// Helper function to get the appropriate color
function getColor(d, isActive) {
    if (!isActive) return "#cccccc";
    if (coloringMode === 'source') return colorScale(d.source);
    if (coloringMode === 'cluster') return clusterColorScale(d[clusterKey]);
    return networkColorScale(d.network);
}

function updatePlot(startDate, endDate, searchTerm = '') {
    drawCanvas();
    
    // Update info box
    const visibleCount = allData.filter(d => isPointActive(d)).length;
    const infoBox = d3.select("#info-box");
    if (searchTerm !== '') {
        infoBox.html(`Showing ${visibleCount} results for "${searchTerm}" within the selected date range.<br/><br/>Hover over a point to see the details. Click to navigate to the poem.`);
    } else {
        infoBox.html(`Showing ${visibleCount} results within the selected date range.<br/><br/>Hover over a point to see the details. Click to navigate to the poem.`);
    }
}

// Update handleMouseOver
function handleMouseOver(event, d) {
    const isActive = d.date >= dateSlider.get()[0] && 
                    d.date <= dateSlider.get()[1] &&
                    (selectedSources.length === 0 || selectedSources.includes(d.source)) &&
                    (searchTerm === '' || d.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     d.text.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!isActive) return;

    const baseRadius = hasAmountColumn ? sizeScale(d.amount) : 5;
    const hoverRadius = baseRadius * 2;  // Double the size on hover

    d3.select(this)
        .raise()
        .transition()
        .duration(150)
        .attr("r", hoverRadius)
        .style("fill", getColor(d, true))
        .style("opacity", 1)
        .style("stroke", "black")
        .style("stroke-width", "1px");

    const source = d.url ? d.url : "#§" + d.title.replace(/\s+/g, '-').toLowerCase();
    let infoText = "<strong>Title:</strong> " + highlightText(d.title, searchTerm);    
    // Add amount information if it exists
    if (hasAmountColumn) {
        infoText += "<br/><strong>Amount:</strong> " + d.amount.toLocaleString();
    }

    infoText += "<br/><strong>Date:</strong> " + formatDate(d.date) +
                "<br/><strong>Author:</strong> " + d.author +
                "<br/><strong>Source:</strong> " + `<a href="${source}" target="_blank">${d.url}</a>`;

    d3.select("#info-box").html(infoText);
}

function handleMouseOut() {
    const dot = d3.select(this);
    const d = dot.datum();
    
    // Use the same isActive logic as in updatePlot
    const isActive = d.date >= dateSlider.get().map(v => new Date(+v))[0] && 
                    d.date <= dateSlider.get().map(v => new Date(+v))[1] &&
                    (selectedSources.length === 0 || selectedSources.includes(d.source)) &&
                    (searchTerm === '' || 
                     d.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                     d.text.toLowerCase().includes(searchTerm.toLowerCase()));

    dot.transition()
        .duration(150)
        .attr("r", hasAmountColumn ? sizeScale(d.amount) : 5)
        .style("fill", isActive ? 
            (coloringMode === 'source' ? colorScale(d.source) : networkColorScale(d.network)) 
            : "#cccccc")
        .style("opacity", isActive ? 0.7 : 0.1)
        .style("stroke", "none");

    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
}

function handleClick(event, d) {
    const source = d.url ? d.url : "#§" + d.title.replace(/\s+/g, '-').toLowerCase();
    window.open(source, "_blank");
}

function performSearch() {
    searchTerm = document.getElementById('search-box').value.toLowerCase();
    const dateValues = dateSlider.get().map(d => new Date(+d));
    updatePlot(dateValues[0], dateValues[1], searchTerm);
    updateURL(searchTerm, dateValues[0], dateValues[1]);
}

function resetVisualization() {
    // Reset search
    document.getElementById('search-box').value = '';
    searchTerm = '';

    // Reset date range
    const dateExtent = d3.extent(allData, d => d.date);
    dateSlider.set(dateExtent.map(d => d.getTime()));

    // Reset filter combobox
    document.getElementById('filter-tags').innerHTML = '';
    document.getElementById('filter-input').value = '';
    document.getElementById('filter-dropdown').classList.remove('open');
    selectedSources = [];
    selectedClusters = [];

    // Update plot
    updatePlot(dateExtent[0], dateExtent[1], '');
    
    // Update URL with reset values
    updateURL('', dateExtent[0], dateExtent[1]);
}

// Utility functions
function highlightText(text, term) {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function setupDotSizeControls() {
    const slider = document.getElementById('dot-size-slider');
    const display = document.getElementById('dot-size-value');
    if (!slider) return;

    noUiSlider.create(slider, {
        start: [1.0],
        range: { min: 0.2, max: 4.0 },
        step: 0.1
    });

    slider.noUiSlider.on('update', (values) => {
        dotSizeMultiplier = +values[0];
        display.textContent = (+values[0]).toFixed(1) + 'x';
        drawCanvas();
    });
}

function setupHighlightStyleControls() {
    const toggleBtn = document.getElementById('highlight-style-toggle');
    const panel = document.getElementById('highlight-style-panel');
    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', () => {
        const isOpen = panel.style.display !== 'none';
        panel.style.display = isOpen ? 'none' : 'block';
        toggleBtn.querySelector('.toggle-arrow').textContent = isOpen ? '▶' : '▼';
    });

    const colorAutoCheck = document.getElementById('highlight-color-auto');
    const colorPicker = document.getElementById('highlight-color-picker');
    colorAutoCheck.addEventListener('change', () => {
        colorPicker.disabled = colorAutoCheck.checked;
        highlightColorOverride = colorAutoCheck.checked ? null : colorPicker.value;
        drawCanvas();
    });
    colorPicker.addEventListener('input', () => {
        if (!colorAutoCheck.checked) { highlightColorOverride = colorPicker.value; drawCanvas(); }
    });

    const opacityInput = document.getElementById('highlight-opacity-slider');
    const opacityValue = document.getElementById('highlight-opacity-value');
    opacityInput.addEventListener('input', () => {
        highlightOpacity = +opacityInput.value / 100;
        opacityValue.textContent = opacityInput.value + '%';
        drawCanvas();
    });

    const sizeInput = document.getElementById('highlight-size-slider');
    const sizeValue = document.getElementById('highlight-size-value');
    sizeInput.addEventListener('input', () => {
        highlightSizeMultiplier = +sizeInput.value;
        sizeValue.textContent = (+sizeInput.value).toFixed(1) + '×';
        drawCanvas();
    });

    const borderCheck = document.getElementById('highlight-border-enabled');
    const borderColorInput = document.getElementById('highlight-border-color');
    const borderWidthInput = document.getElementById('highlight-border-width-input');
    const borderWidthValue = document.getElementById('highlight-border-width-value');
    borderCheck.addEventListener('change', () => {
        highlightAlwaysBorder = borderCheck.checked;
        borderColorInput.disabled = !borderCheck.checked;
        borderWidthInput.disabled = !borderCheck.checked;
        drawCanvas();
    });
    borderColorInput.addEventListener('input', () => {
        highlightBorderColor = borderColorInput.value;
        drawCanvas();
    });
    borderWidthInput.addEventListener('input', () => {
        highlightBorderWidth = +borderWidthInput.value;
        borderWidthValue.textContent = borderWidthInput.value + 'px';
        drawCanvas();
    });
}

function setupLLMOverlayControls() {
    const toggle = document.getElementById('llm-overlay-toggle');
    const opacityContainer = document.getElementById('llm-opacity-container');
    const opacitySlider = document.getElementById('llm-opacity-slider');
    const opacityDisplay = document.getElementById('llm-opacity-value');

    if (!toggle) return;

    toggle.addEventListener('change', () => {
        llmOverlayEnabled = toggle.checked;
        opacityContainer.style.display = toggle.checked ? 'flex' : 'none';
        drawCanvas();
    });

    noUiSlider.create(opacitySlider, {
        start: [60],
        range: { min: 0, max: 100 },
        step: 1
    });

    opacitySlider.noUiSlider.on('update', (values) => {
        llmOverlayOpacity = +values[0] / 100;
        opacityDisplay.textContent = Math.round(+values[0]) + '%';
        if (llmOverlayEnabled) drawCanvas();
    });
}

// Initialize visualization
// Update the initialization section at the bottom of the file:
try {
    const dataUrl = getFilenameFromURL();
    const llmFileUrl = getLLMFileFromURL();

    const mainDataPromise = loadData(dataUrl).then(showMainContent);
    const llmPromise = llmFileUrl ? loadLLMLabels(llmFileUrl) : Promise.resolve({});

    Promise.all([mainDataPromise, llmPromise])
        .then(([data, llmMap]) => {
            llmLabelMap = llmMap;
            return data;
        })
        .then(data => {
                        
            const downloadLink = document.getElementById('download-link');
            downloadLink.href = dataUrl;
            setupCanvas();
            updateDescription();

            allData = data;
                    
            allData.forEach(function(d) {
                d.x = +d.x;
                d.y = +d.y;
                d.date = parseDate(d.date);
                if ('amount' in d) {
                    d.amount = +d.amount;  // Convert to number
                }
            });

            // Check if amount column exists
            hasAmountColumn = 'amount' in allData[0];

            // Setup size scale if amount column exists
            if (hasAmountColumn) {
                const minAmount = d3.min(allData, d => d.amount);
                const maxAmount = d3.max(allData, d => d.amount);
                sizeScale = d3.scaleSqrt()  // Using sqrt scale for better visual representation
                    .domain([minAmount, maxAmount])
                    .range([3, 15]);  // Min and max radius in pixels
            }

            // Sort data by date
            allData.sort((a, b) => a.date - b.date);

            // Set up scales
            xScale = d3.scaleLinear()
                .domain(d3.extent(allData, d => d.x));
            yScale = d3.scaleLinear()
                .domain(d3.extent(allData, d => d.y));

            // Set up color scale
            const uniqueSources = [...new Set(allData.map(d => d.source))];
            colorScale = d3.scaleOrdinal()
                .domain(uniqueSources)
                .range([
                    '#e41a1c', // red
                    '#377eb8', // blue
                    '#4daf4a', // green
                    '#984ea3', // purple
                    '#ff7f00', // orange
                    '#a65628', // brown
                    '#f781bf', // pink
                    '#458b74', // sea green
                    '#b2182b'  // dark red
                ]);

            // Add this where you set up your initial color scales
            networkColorScale = d3.scaleOrdinal()
                .domain(['Metric Media', 'Courier'])
                .range([
                    '#e41a1c', // red
                    '#377eb8', // blue
                ]);

            // Use cluster_label if present, otherwise fall back to numeric cluster
            clusterKey = ('cluster_label' in allData[0] && allData[0].cluster_label)
                ? 'cluster_label' : 'cluster';

            // Set up cluster color scale
            const uniqueClusters = [...new Set(allData.map(d => d[clusterKey]))]
                .filter(Boolean)
                .sort((a, b) => {
                    // numeric sort for raw cluster ids, alpha for labels
                    const na = +a, nb = +b;
                    return isNaN(na) ? a.localeCompare(b) : na - nb;
                });
            clusterColorScale = d3.scaleOrdinal()
                .domain(uniqueClusters)
                .range(d3.schemeTableau10);

            // Setup UI elements and event listeners
            // Restore coloring mode from URL before setting up filter buttons
            const { coloring: initialColoring } = readURLParams();
            if (initialColoring === 'cluster') {
                coloringMode = 'cluster';
                document.querySelector('input[name="color-by"][value="cluster"]').checked = true;
                setupClusterButtons(uniqueClusters);
            } else {
                setupSourceButtons(uniqueSources);
            }
            setupDateSlider();
            setupPlaybackControls();
            setupSearchControls();
            setupDotSizeControls();
            setupLLMOverlayControls();

            // Initial update (must happen before highlight controls so xScale has a range)
            updatePlotSize();
            setupHighlightStyleControls();
            
            window.addEventListener('resize', updatePlotSize);

            // Clear URL if no meaningful parameters were set
            const _p = new URLSearchParams(window.location.search);
            if (!_p.get('search') && !_p.get('start') && !_p.get('end') &&
                !_p.get('sources') && !_p.get('clusters') && !_p.get('coloring')) {
                history.pushState(null, '', window.location.pathname);
            }
        });
} catch (error) {
    loadingContainer.innerHTML = `
        <div class="loading-text" style="color: red;">
            ${error.message}<br><br>
            Run the pipeline first: <code>bash run.sh</code><br>
            Then open: <code>http://localhost:8000/docs/index.html?outputfile=stories_processed.csv</code>
        </div>`;
    console.error('Error:', error);
}
