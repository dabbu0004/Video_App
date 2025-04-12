import React, { useContext, useEffect, useState } from "react";
import { AuthContext } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import HomeIcon from "@mui/icons-material/Home";
import { IconButton, CircularProgress, Alert } from "@mui/material"; // Added CircularProgress and Alert

export default function History() {
  const { getHistoryOfUser } = useContext(AuthContext);

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true); // Track loading state
  const [error, setError] = useState(null); // Track error state

  const routeTo = useNavigate(); 

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true); // Start loading
      try {
        const history = await getHistoryOfUser();
        if (Array.isArray(history)) {
          setMeetings(history);
        } else {
          // Handle case where history is not an array (e.g., an error object)
          console.warn("getHistoryOfUser returned non-array:", history);
          setError("Failed to fetch meeting history.");
        }
      } catch (e) {
        console.error("Error fetching history:", e);
        setError("Failed to fetch meeting history.");
      } finally {
        setLoading(false); // Stop loading regardless of success/failure
      }
    };

    fetchHistory();
  }, []);

  let formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px" }}>
        <CircularProgress />
      </div>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <div>
      <IconButton onClick={() => { routeTo("/home"); }}>
        <HomeIcon />
      </IconButton>
      {meetings.length > 0 ? (
        meetings.map((e, i) => (
          <Card key={i} variant="outlined">
            <CardContent>
              <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
                Code: {e.meetingCode}
              </Typography>
              <Typography sx={{ mb: 1.5 }} color="text.secondary">
                Date: {formatDate(e.date)}
              </Typography>
            </CardContent>
          </Card>
        ))
      ) : (
        <Typography>No meeting history found.</Typography>
      )}
    </div>
  );
}