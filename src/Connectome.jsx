import React, { useEffect, useState } from "react";
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";
import Papa from "papaparse";

//global plotly instead of importing plotly.js directly
console.log("window.Plotly =", window.Plotly);
const Plot = createPlotlyComponent.default(Plotly);

export default function MatrixDashboard() {
  const [matrixData, setMatrixData] = useState(null);
  const [cellInfo, setCellInfo] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSegments, setSelectedSegments] = useState(["10327", "11670"]);
  const [baseState, setBaseState] = useState(null);
  const [selectedCellData, setSelectedCellData] = useState(null);

  // Load matrix data
  useEffect(() => {
    fetch("./matrix.json")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch matrix.json");
        return res.json();
      })
      .then((data) => setMatrixData(data))
      .catch((err) => setError(err.message));
  }, []);

  // Load cell info CSV
  useEffect(() => {
    fetch("./cell_info.csv")
      .then((res) => res.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: false, // Keep as strings to avoid type mismatches
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(), // Remove whitespace from headers
          complete: (results) => {
            console.log("CSV loaded, rows:", results.data.length);
            console.log("First row:", results.data[0]);
            console.log("Headers:", Object.keys(results.data[0]));
            // Ensure bodyId_post is treated as string
            const cleanedData = results.data.map(row => ({
              ...row,
              bodyId_post: String(row.bodyId_post).trim()
            }));
            console.log("Sample bodyId_post values:", cleanedData.slice(0, 5).map(r => r.bodyId_post));
            setCellInfo(cleanedData);
          },
          error: (err) => {
            console.error("Error parsing CSV:", err);
          }
        });
      })
      .catch((err) => console.error("Failed to load cell_info.csv:", err));
  }, []);

  // Load base neuroglancer state
  useEffect(() => {
    fetch("./state.json")
      .then((res) => res.json())
      .then((state) => {
        setBaseState(state);
        
        // Extract initial segments from state (remove ! prefix if present)
        const mancLayer = state.layers.find(
          (layer) => layer.name === "manc:v1.2.3"
        );
        if (mancLayer && mancLayer.segments) {
          const initialSegs = mancLayer.segments.map(seg => 
            typeof seg === 'string' && seg.startsWith("!") ? seg.substring(1) : String(seg)
          );
          setSelectedSegments(initialSegs);
          
          // Set initial cell data if available
          if (cellInfo && initialSegs.length > 0) {
            const cellData = cellInfo.find(
              cell => String(cell.bodyId_post) === initialSegs[0]
            );
            if (cellData) setSelectedCellData(cellData);
          }
        }
      })
      .catch((err) => console.error("Failed to load state.json:", err));
  }, [cellInfo]);

  // Generate Neuroglancer URL with updated segments
  const getNeuroglancerUrl = () => {
    if (!baseState) return "";

    // Deep clone the state
    const updatedState = JSON.parse(JSON.stringify(baseState));

    // Find and update the manc:v1.2.3 layer segments
    const mancLayer = updatedState.layers.find(
      (layer) => layer.name === "manc:v1.2.3"
    );
    
    if (mancLayer) {
      // Check if segments need ! prefix or not based on original state
      const needsPrefix = baseState.layers
        .find(l => l.name === "manc:v1.2.3")
        ?.segments?.[0]?.startsWith?.("!");
      
      mancLayer.segments = needsPrefix 
        ? selectedSegments.map(seg => `!${seg}`)
        : selectedSegments;
      
      // Also update segmentQuery if there's at least one segment
      if (selectedSegments.length > 0) {
        mancLayer.segmentQuery = selectedSegments[0];
      }
    }

    // Encode state as JSON string for URL
    const stateString = JSON.stringify(updatedState);
    const encodedState = encodeURIComponent(stateString);

    // Use the public Neuroglancer instance
    return `https://neuroglancer-demo.appspot.com/#!${encodedState}`;
  };

  // Handle heatmap click
  const handlePlotClick = (data) => {
    if (data.points && data.points.length > 0) {
      const point = data.points[0];
      const clickedCol = point.x;
      const segmentId = String(clickedCol);
      
      setSelectedSegments(prev => {
        if (!prev.includes(segmentId)) {
          return [...prev, segmentId];
        }
        return prev;
      });

      // Find cell info for this segment
      if (cellInfo) {
        const cellData = cellInfo.find(
          cell => String(cell.bodyId_post) === segmentId
        );
        setSelectedCellData(cellData);
      }
    }
  };

  if (error) return <div>Error: {error}</div>;
  if (!matrixData) return <div>Loading matrix...</div>;
  if (!baseState) return <div>Loading Neuroglancer state...</div>;
  if (!cellInfo) return <div>Loading cell info...</div>;

  const rows = [...new Set(matrixData.map((d) => d.row))];
  const cols = [...new Set(matrixData.map((d) => d.col))];
  
  // Debug: Check overlap
  const csvBodyIds = new Set(cellInfo.map(c => String(c.bodyId_post)));
  const matrixCols = new Set(cols.map(c => String(c)));
  const overlap = [...matrixCols].filter(col => csvBodyIds.has(col));
  console.log("Matrix columns:", cols.length);
  console.log("CSV bodyId_post values:", csvBodyIds.size);
  console.log("Overlap:", overlap.length, overlap.slice(0, 10));
  
  const z = rows.map((r) =>
    cols.map((c) => {
      const cell = matrixData.find((d) => d.row === r && d.col === c);
      return cell ? cell.weight : 0;
    })
  );

  return (
    <div style={{ display: "flex", 
      height: "100vh", 
      maxWidth: "1400px",
      width: "150%", 
      margin: 10,
      justifyContent: "center", 
      
         }}>

      {/* Left side - Matrix */}
      <div style={{
                    flex: 1,
                    padding: "100px",
                    overflow: "auto",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",       // <-- centers left column content
                  }}>

        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>
          Interactive Connectome Matrix
        </h1>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Selected Segments:</strong> {selectedSegments.join(", ")}
          <button 
            onClick={() => setSelectedSegments(["10327", "11670"])}
            style={{ 
              marginLeft: "1rem", 
              padding: "0.25rem 0.5rem",
              cursor: "pointer"
            }}
          >
            Reset
          </button>
          <button 
            onClick={() => setSelectedSegments([])}
            style={{ 
              marginLeft: "0.5rem", 
              padding: "0.25rem 0.5rem",
              cursor: "pointer"
            }}
          >
            Clear All
          </button>
        </div>
        <Plot
          data={[
            {
              z: z,
              x: cols,
              y: rows,
              
              zmax: 100,
              zmin: 0,
              type: "heatmap",
              colorscale: "Greens",
              hovertemplate: "Row: %{y}<br>Col: %{x}<br>Weight: %{z}<extra></extra>",
            },
          ]}
          layout={{
            width: 700,
            height: 700,
            title: "Click cells to add segments",
            xaxis: {
              title: "pre-synaptic Segment ID",
              type: 'category',
              tickformat: 'd',
              tickangle: -45,
            },
            yaxis: {
              type: 'category',
              title: "post-synaptic Segment ID",
              tickformat: 'd',
              autorange: "reversed",
            },
          }}
          onClick={handlePlotClick}
        />

        {/* Cell Info Table */}
        {selectedCellData && (
          <div style={{ marginTop: "2rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Cell Information - Segment {selectedCellData.bodyId_post}
            </h2>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #ddd"
            }}>
              <tbody>
                {Object.entries(selectedCellData).map(([key, value]) => (
                  <tr key={key} style={{ borderBottom: "1px solid #ddd" }}>
                    <td style={{
                      padding: "8px",
                      fontWeight: "bold",
                      backgroundColor: "#f5f5f5",
                      width: "40%",
                      textAlign: "left"
                    }}>
                      {key}
                    </td>
                    <td style={{
                      padding: "8px",
                      textAlign: "left"
                    }}>
                      {value !== null && value !== undefined ? String(value) : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right side - Neuroglancer iframe */}
      <div style={{ flex: 1, 
        position: "relative", 
        borderLeft: "2px solid #ccc" ,
       minWidth: "50%",   
        alignItems: "center"}}>
        <iframe
          src={getNeuroglancerUrl()}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
          }}
          title="Neuroglancer Viewer"
        />
      </div>
    </div>
  );
}
