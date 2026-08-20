import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button, Tooltip, Paper } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import server from '../environment';

const server_url = server;
const peerConfigConnections = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
    ]
};

// Remote Video Component ensuring continuous stream binding
const RemoteVideo = ({ stream, socketId }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div style={{
            position: "relative",
            flex: "1 1 300px",
            maxWidth: "480px",
            aspectRatio: "16/9",
            backgroundColor: "#1e1e1e",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
        }}>
            <video
                data-socket={socketId}
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <span style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                backgroundColor: "rgba(0,0,0,0.6)",
                color: "#fff",
                padding: "2px 8px",
                borderRadius: "4px",
                fontSize: "12px"
            }}>
                Participant
            </span>
        </div>
    );
};

export default function VideoMeetComponent() {
    const socketRef = useRef(null);
    const socketIdRef = useRef(null);
    const localVideoRef = useRef(null);
    const connectionsRef = useRef({});
    const localStreamRef = useRef(null);

    // Media and permission states (utilized for UI disable state & toggles)
    const [hasCamera, setHasCamera] = useState(true);
    const [hasMicrophone, setHasMicrophone] = useState(true);
    const [isVideoEnabled, setIsVideoEnabled] = useState(true);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenAvailable, setScreenAvailable] = useState(false);

    // Chat and Modal states
    const [showChat, setShowChat] = useState(false);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState("");
    const [unreadCount, setUnreadCount] = useState(0);

    // Lobby states
    const [inLobby, setInLobby] = useState(true);
    const [username, setUsername] = useState("");
    const [remoteVideos, setRemoteVideos] = useState([]);

    // Initialize media permissions on mount
    const initLocalMedia = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            window.localStream = stream;

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            setHasCamera(true);
            setHasMicrophone(true);
            setIsVideoEnabled(true);
            setIsAudioEnabled(true);
        } catch (error) {
            console.warn("Could not retrieve both audio and video, trying fallbacks:", error);
            // Fallback: try video only or audio only
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                localStreamRef.current = stream;
                window.localStream = stream;
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                setHasCamera(true);
                setHasMicrophone(false);
                setIsAudioEnabled(false);
            } catch {
                setHasCamera(false);
                setIsVideoEnabled(false);
            }
        }

        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            setScreenAvailable(true);
        }
    }, []);

    useEffect(() => {
        initLocalMedia();

        return () => {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [initLocalMedia]);

    // Socket and WebRTC connection handler
    const connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: true, reconnection: true });

        socketRef.current.on('connect', () => {
            socketIdRef.current = socketRef.current.id;
            socketRef.current.emit('join-call', window.location.href);

            socketRef.current.on('chat-message', (data, sender, senderSocketId) => {
                setMessages(prev => [...prev, { sender, data }]);
                if (senderSocketId !== socketIdRef.current) {
                    setUnreadCount(prev => prev + 1);
                }
            });

            socketRef.current.on('user-left', (id) => {
                if (connectionsRef.current[id]) {
                    connectionsRef.current[id].close();
                    delete connectionsRef.current[id];
                }
                setRemoteVideos(prev => prev.filter(v => v.socketId !== id));
            });

            socketRef.current.on('user-joined', (id, clients) => {
                clients.forEach((socketListId) => {
                    if (connectionsRef.current[socketListId]) return;

                    const peer = new RTCPeerConnection(peerConfigConnections);
                    connectionsRef.current[socketListId] = peer;

                    peer.onicecandidate = (event) => {
                        if (event.candidate) {
                            socketRef.current.emit('signal', socketListId, JSON.stringify({ ice: event.candidate }));
                        }
                    };

                    peer.ontrack = (event) => {
                        setRemoteVideos(prev => {
                            const exists = prev.find(v => v.socketId === socketListId);
                            if (exists) {
                                return prev.map(v => v.socketId === socketListId ? { ...v, stream: event.streams[0] } : v);
                            }
                            return [...prev, { socketId: socketListId, stream: event.streams[0] }];
                        });
                    };

                    if (localStreamRef.current) {
                        localStreamRef.current.getTracks().forEach(track => {
                            peer.addTrack(track, localStreamRef.current);
                        });
                    }
                });

                // Initiate offer if this client triggered the join
                if (id === socketIdRef.current) {
                    for (let id2 in connectionsRef.current) {
                        if (id2 === socketIdRef.current) continue;

                        connectionsRef.current[id2].createOffer().then(description => {
                            connectionsRef.current[id2].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', id2, JSON.stringify({ sdp: connectionsRef.current[id2].localDescription }));
                            });
                        }).catch(err => console.error("Offer creation error:", err));
                    }
                }
            });

            socketRef.current.on('signal', (fromId, messageString) => {
                const signal = JSON.parse(messageString);
                if (fromId === socketIdRef.current) return;

                const peer = connectionsRef.current[fromId];
                if (!peer) return;

                if (signal.sdp) {
                    peer.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                        if (signal.sdp.type === 'offer') {
                            peer.createAnswer().then(description => {
                                peer.setLocalDescription(description).then(() => {
                                    socketRef.current.emit('signal', fromId, JSON.stringify({ sdp: peer.localDescription }));
                                });
                            });
                        }
                    }).catch(err => console.error("Signal SDP error:", err));
                }

                if (signal.ice) {
                    peer.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(err => console.error("ICE error:", err));
                }
            });
        });
    };

    // Zoom-like Camera On/Off Toggle
    const handleToggleVideo = () => {
        if (!hasCamera || !localStreamRef.current) return;

        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsVideoEnabled(videoTrack.enabled);
        }
    };

    // Zoom-like Microphone Mute/Unmute Toggle
    const handleToggleAudio = () => {
        if (!hasMicrophone || !localStreamRef.current) return;

        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsAudioEnabled(audioTrack.enabled);
        }
    };

    // Screen Sharing Toggle with Peer Video Track Replacement
    const handleToggleScreenShare = async () => {
        if (!isScreenSharing) {
            try {
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
                const screenVideoTrack = screenStream.getVideoTracks()[0];

                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = screenStream;
                }

                // Replace outgoing video track on all WebRTC peer connections
                for (let id in connectionsRef.current) {
                    const senders = connectionsRef.current[id].getSenders();
                    const sender = senders.find(s => s.track && s.track.kind === 'video');
                    if (sender) {
                        sender.replaceTrack(screenVideoTrack);
                    }
                }

                screenVideoTrack.onended = () => {
                    stopScreenSharing();
                };

                setIsScreenSharing(true);
            } catch (err) {
                console.error("Screen sharing cancelled or failed:", err);
            }
        } else {
            stopScreenSharing();
        }
    };

    const stopScreenSharing = () => {
        if (localStreamRef.current && localVideoRef.current) {
            const cameraTrack = localStreamRef.current.getVideoTracks()[0];
            localVideoRef.current.srcObject = localStreamRef.current;

            for (let id in connectionsRef.current) {
                const senders = connectionsRef.current[id].getSenders();
                const sender = senders.find(s => s.track && s.track.kind === 'video');
                if (sender && cameraTrack) {
                    sender.replaceTrack(cameraTrack);
                }
            }
        }
        setIsScreenSharing(false);
    };

    // End call & cleanup
    const handleEndCall = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }
        Object.values(connectionsRef.current).forEach(peer => peer.close());
        connectionsRef.current = {};

        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        window.location.href = "/home";
    };

    // Chat Message Dispatch
    const handleSendMessage = () => {
        if (message.trim() && socketRef.current) {
            socketRef.current.emit('chat-message', message.trim(), username || "User");
            setMessage("");
        }
    };

    const handleJoinMeeting = () => {
        if (!username.trim()) return;
        setInLobby(false);
        connectToSocketServer();
    };

    return (
        <div style={{ width: "100vw", height: "100vh", backgroundColor: "#121212", color: "#fff", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {inLobby ? (
                /* Lobby Screen */
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "20px" }}>
                    <Paper elevation={4} style={{ padding: "32px", borderRadius: "16px", backgroundColor: "#1e1e1e", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", width: "90%", maxWidth: "420px" }}>
                        <h2 style={{ margin: 0, color: "#fff" }}>Ready to join?</h2>
                        <div style={{ width: "100%", aspectRatio: "16/9", backgroundColor: "#000", borderRadius: "12px", overflow: "hidden" }}>
                            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                        <TextField
                            fullWidth
                            variant="outlined"
                            label="Your Name"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleJoinMeeting()}
                            InputLabelProps={{ style: { color: "#aaa" } }}
                            inputProps={{ style: { color: "#fff" } }}
                        />
                        <Button
                            fullWidth
                            variant="contained"
                            size="large"
                            onClick={handleJoinMeeting}
                            disabled={!username.trim()}
                            style={{ backgroundColor: "#1976d2", padding: "12px" }}
                        >
                            Join Meeting
                        </Button>
                    </Paper>
                </div>
            ) : (
                /* Active Meeting Stage */
                <div style={{ display: "flex", flex: 1, height: "calc(100vh - 80px)", position: "relative" }}>
                    {/* Main Video Grid */}
                    <div style={{
                        flex: 1,
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "16px",
                        padding: "16px",
                        overflowY: "auto"
                    }}>
                        {/* Local User Tile */}
                        <div style={{
                            position: "relative",
                            flex: "1 1 300px",
                            maxWidth: "480px",
                            aspectRatio: "16/9",
                            backgroundColor: "#1e1e1e",
                            borderRadius: "12px",
                            overflow: "hidden",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
                        }}>
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    transform: isScreenSharing ? "none" : "scaleX(-1)"
                                }}
                            />
                            <span style={{
                                position: "absolute",
                                bottom: "10px",
                                left: "10px",
                                backgroundColor: "rgba(0,0,0,0.6)",
                                color: "#fff",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                fontSize: "12px"
                            }}>
                                You ({username}) {!isVideoEnabled && "(Camera Off)"}
                            </span>
                        </div>

                        {/* Remote User Tiles */}
                        {remoteVideos.map((v) => (
                            <RemoteVideo key={v.socketId} socketId={v.socketId} stream={v.stream} />
                        ))}
                    </div>

                    {/* Chat Drawer */}
                    {showChat && (
                        <div style={{
                            width: "340px",
                            backgroundColor: "#1a1a1a",
                            borderLeft: "1px solid #2a2a2a",
                            display: "flex",
                            flexDirection: "column",
                            height: "100%"
                        }}>
                            <div style={{ padding: "16px", borderBottom: "1px solid #2a2a2a", fontWeight: "bold" }}>
                                In-Call Messages
                            </div>
                            <div style={{ flex: 1, padding: "16px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
                                {messages.length === 0 ? (
                                    <p style={{ color: "#777", textAlign: "center", marginTop: "40px" }}>No messages yet</p>
                                ) : (
                                    messages.map((m, idx) => (
                                        <div key={idx} style={{ backgroundColor: "#262626", padding: "8px 12px", borderRadius: "8px" }}>
                                            <span style={{ fontSize: "12px", color: "#1976d2", fontWeight: "bold" }}>{m.sender}</span>
                                            <p style={{ margin: "4px 0 0 0", fontSize: "14px" }}>{m.data}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div style={{ padding: "12px", display: "flex", gap: "8px", borderTop: "1px solid #2a2a2a" }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder="Send a message..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                    inputProps={{ style: { color: "#fff" } }}
                                />
                                <Button variant="contained" onClick={handleSendMessage}>Send</Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Bottom Control Bar */}
            {!inLobby && (
                <div style={{
                    height: "80px",
                    backgroundColor: "#181818",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "20px",
                    borderTop: "1px solid #282828"
                }}>
                    <Tooltip title={isVideoEnabled ? "Turn off camera" : "Turn on camera"}>
                        <IconButton
                            onClick={handleToggleVideo}
                            style={{
                                backgroundColor: isVideoEnabled ? "#2a2a2a" : "#d32f2f",
                                color: "#fff",
                                padding: "12px"
                            }}
                        >
                            {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}>
                        <IconButton
                            onClick={handleToggleAudio}
                            style={{
                                backgroundColor: isAudioEnabled ? "#2a2a2a" : "#d32f2f",
                                color: "#fff",
                                padding: "12px"
                            }}
                        >
                            {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>
                    </Tooltip>

                    {screenAvailable && (
                        <Tooltip title={isScreenSharing ? "Stop sharing" : "Share screen"}>
                            <IconButton
                                onClick={handleToggleScreenShare}
                                style={{
                                    backgroundColor: isScreenSharing ? "#2e7d32" : "#2a2a2a",
                                    color: "#fff",
                                    padding: "12px"
                                }}
                            >
                                {isScreenSharing ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                            </IconButton>
                        </Tooltip>
                    )}

                    <Tooltip title="Chat">
                        <IconButton
                            onClick={() => {
                                setShowChat(!showChat);
                                setUnreadCount(0);
                            }}
                            style={{ backgroundColor: "#2a2a2a", color: "#fff", padding: "12px" }}
                        >
                            <Badge badgeContent={unreadCount} color="error">
                                <ChatIcon />
                            </Badge>
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Leave Call">
                        <IconButton
                            onClick={handleEndCall}
                            style={{ backgroundColor: "#d32f2f", color: "#fff", padding: "12px" }}
                        >
                            <CallEndIcon />
                        </IconButton>
                    </Tooltip>
                </div>
            )}
        </div>
    );
}