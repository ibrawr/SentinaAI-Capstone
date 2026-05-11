/**
 * Displays the sustainability hall details page for a selected hall, including
 * hall overview data, environmental metrics, sustainability KPIs, and AI-driven
 * insight such as recommended action and anomaly status. This page uses React
 * Router params and navigation, fetches hall details from the sustainability API,
 * and applies SustainabilityHallDetails.css styling for the layout.
 */

import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import "./SustainabilityHallDetails.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function formatAction(action) {
    if (!action || action === "none") return "No action required";

    const map = {
        scheduleMaintenance: "Schedule Maintenance",
        optimizeHVAC: "Optimize HVAC",
        reduceLoad: "Reduce Load"
    };

    return map[action] || action;
}

export default function SustainabilityHallDetails() {

    const { id } = useParams();
    const navigate = useNavigate();

    const [hall, setHall] = useState(null);

    useEffect(() => {

        const load = async () => {

            const res = await axios.get(`${API_BASE}/sustainability/hall/${id}`);
            setHall(res.data?.hall || null);

        };

        load();

    }, [id]);

    if (!hall) return <div className="loading">Loading...</div>;

    const status = String(hall.sustainability_status || "green").toLowerCase();

    const hvac = num(hall.hvac_energy_kwh);
    const carbon = num(hall.carbon_kg_co2);
    const occ = num(hall.occupancy_ratio);

    return (

        <div className="sustPage">


            <div className="sustHeader">

                <button
                    className="backBtn"
                    onClick={() => navigate(-1)}
                >
                    ←
                </button>

                <div className="headerTitle">

                    Hall Sustainability | {hall.hall_name}

                    <span className={`statusBadge ${status}`}>
                        {status}
                    </span>

                </div>

            </div>


            <div className="kpiRow">

                <div className={`kpiCard energy ${status}`}>

                    <div className="kpiLabel">Energy Usage</div>

                    <div className="kpiValue">
                        {hvac ? hvac.toFixed(2) : "-"} kWh
                    </div>

                </div>

                <div className="kpiCard neutral">

                    <div className="kpiLabel">Carbon Emissions</div>

                    <div className="kpiValue">
                        {carbon ? carbon.toFixed(2) : "-"}
                    </div>

                </div>

                <div className="kpiCard neutral">

                    <div className="kpiLabel">Occupancy</div>

                    <div className="kpiValue">
                        {occ ? (occ * 100).toFixed(1) + "%" : "-"}
                    </div>

                </div>

            </div>


            <div className="aiCard">

                <div className="aiHeader">
                    AI Insight
                </div>

                <div className="aiContent">

                    <div className="aiRow">
                        <span className="aiLabel">AI Action</span>

                        <span className="aiAction">
                            {formatAction(hall.ai_action)}
                        </span>
                    </div>

                    <div className="aiRow">
                        <span className="aiLabel">Anomaly Detected</span>

                        {hall.is_anomaly ? (
                            <span className="aiBadge red">Yes</span>
                        ) : (
                            <span className="aiBadge green">No</span>
                        )}
                    </div>

                </div>

            </div>




            <div className="contentGrid">

                <div className="card">

                    <h2 className="cardTitle">Hall Overview</h2>

                    <div className="infoGrid">

                        <div>
                            <label>Hall ID</label>
                            <div>{hall.hall_id}</div>
                        </div>

                        <div>
                            <label>Zone</label>
                            <div>{hall.zone_id}</div>
                        </div>

                        <div>
                            <label>Role</label>
                            <div>{hall.venue_role}</div>
                        </div>

                        <div>
                            <label>Capacity</label>
                            <div>{hall.hall_capacity}</div>
                        </div>

                        <div>
                            <label>Current Occupancy</label>
                            <div>{hall.current_occupancy}</div>
                        </div>

                        <div>
                            <label>Efficiency Score</label>
                            <div>{hall.energy_efficiency_score}</div>
                        </div>

                    </div>

                </div>



                <div className="card">

                    <h2>Environment Metrics</h2>

                    <table className="metricsTable">

                        <tbody>

                            <tr>
                                <td>Indoor Temperature</td>
                                <td>{hall.indoor_temp_c} °C</td>
                            </tr>

                            <tr>
                                <td>Outdoor Temperature</td>
                                <td>{hall.outdoor_temp_c} °C</td>
                            </tr>

                            <tr>
                                <td>Humidity</td>
                                <td>{hall.humidity_pct} %</td>
                            </tr>

                            <tr>
                                <td>Comfort Index</td>
                                <td>{hall.comfort_index}</td>
                            </tr>

                        </tbody>

                    </table>

                </div>

            </div>



            <div className="footer">

                <button
                    className="backBtn big"
                    onClick={() => navigate(-1)}
                >
                    Back
                </button>

            </div>

        </div >

    );

}