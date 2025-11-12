"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import "./globals.css";

const API_URL = "http://localhost:8000";
const WS_URL = "ws://localhost:8000/ws";

export default function Home() {
  const [board, setBoard] = useState(null);
  const [ws, setWs] = useState(null);
  const [username, setUsername] = useState("");
  const [showCardModal, setShowCardModal] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Initialize WebSocket
  useEffect(() => {
    const websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      console.log("WebSocket connected");
    };

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected");
      // Reconnect after 3 seconds
      setTimeout(() => {
        const newWebsocket = new WebSocket(WS_URL);
        setWs(newWebsocket);
      }, 3000);
    };

    setWs(websocket);

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, []);

  // Load board data
  useEffect(() => {
    loadBoard();

    // Set random username for guest
    setUsername(`Guest_${Math.floor(Math.random() * 1000)}`);
  }, []);

  const loadBoard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/boards`);
      if (response.data.boards.length > 0) {
        const boardId = response.data.boards[0].id;
        const boardResponse = await axios.get(
          `${API_URL}/api/boards/${boardId}`
        );
        setBoard(boardResponse.data);
      }
    } catch (error) {
      console.error("Error loading board:", error);
    }
  };

  const handleWebSocketMessage = useCallback((message) => {
    console.log("WebSocket message:", message);

    switch (message.type) {
      case "card_created":
      case "card_updated":
      case "card_moved":
      case "card_deleted":
      case "column_created":
      case "comment_created":
        loadBoard();
        break;
      default:
        break;
    }
  }, []);

  const createCard = async (columnId) => {
    const title = prompt("Enter card title:");
    if (!title) return;

    try {
      await axios.post(`${API_URL}/api/cards`, {
        column_id: columnId,
        title: title,
        description: "",
        priority: "medium",
        labels: [],
        assigned_to: username,
      });
    } catch (error) {
      console.error("Error creating card:", error);
    }
  };

  const updateCard = async (cardId, updates) => {
    try {
      const card = findCard(cardId);
      await axios.put(`${API_URL}/api/cards/${cardId}`, {
        column_id: card.column_id,
        ...card,
        ...updates,
      });
      setShowCardModal(false);
      setSelectedCard(null);
    } catch (error) {
      console.error("Error updating card:", error);
    }
  };

  const deleteCard = async (cardId) => {
    if (!window.confirm("Are you sure you want to delete this card?")) return;

    try {
      await axios.delete(`${API_URL}/api/cards/${cardId}`);
      setShowCardModal(false);
      setSelectedCard(null);
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  const findCard = (cardId) => {
    for (const column of board.columns) {
      const card = column.cards.find((c) => c.id === cardId);
      if (card) return card;
    }
    return null;
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    try {
      await axios.post(`${API_URL}/api/cards/move`, {
        card_id: draggableId,
        target_column_id: destination.droppableId,
        position: destination.index,
      });
    } catch (error) {
      console.error("Error moving card:", error);
    }
  };

  const openCardModal = (card) => {
    setSelectedCard(card);
    setShowCardModal(true);
  };

  const filterCards = (cards) => {
    if (!searchQuery) return cards;
    return cards.filter(
      (card) =>
        card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (card.description &&
          card.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "high":
        return "#ef4444";
      case "medium":
        return "#f59e0b";
      case "low":
        return "#10b981";
      default:
        return "#6b7280";
    }
  };

  if (!board) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "1.5rem",
          color: "#6b7280",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>📋 {board.name}</h1>
        <div className="header-actions">
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <span className="username">👤 {username}</span>
        </div>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="board">
          {board.columns.map((column) => (
            <div key={column.id} className="column">
              <div className="column-header">
                <h3>{column.name}</h3>
                <span className="card-count">{column.cards.length}</span>
              </div>

              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`card-list ${
                      snapshot.isDraggingOver ? "dragging-over" : ""
                    }`}
                  >
                    {filterCards(column.cards).map((card, index) => (
                      <Draggable
                        key={card.id}
                        draggableId={card.id}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`card ${
                              snapshot.isDragging ? "dragging" : ""
                            }`}
                            onClick={() => openCardModal(card)}
                          >
                            <div className="card-title">{card.title}</div>
                            {card.description && (
                              <div className="card-description">
                                {card.description}
                              </div>
                            )}
                            <div className="card-footer">
                              <span
                                className="priority-badge"
                                style={{
                                  backgroundColor: getPriorityColor(
                                    card.priority
                                  ),
                                }}
                              >
                                {card.priority}
                              </span>
                              {card.assigned_to && (
                                <span className="assigned">
                                  👤 {card.assigned_to}
                                </span>
                              )}
                            </div>
                            {card.labels && card.labels.length > 0 && (
                              <div className="labels">
                                {card.labels.map((label, i) => (
                                  <span key={i} className="label">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              <button
                className="add-card-btn"
                onClick={() => createCard(column.id)}
              >
                + Add Card
              </button>
            </div>
          ))}
        </div>
      </DragDropContext>

      {showCardModal && selectedCard && (
        <CardModal
          card={selectedCard}
          onClose={() => {
            setShowCardModal(false);
            setSelectedCard(null);
          }}
          onUpdate={updateCard}
          onDelete={deleteCard}
          username={username}
        />
      )}
    </div>
  );
}

function CardModal({ card, onClose, onUpdate, onDelete, username }) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [priority, setPriority] = useState(card.priority);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    loadComments();
  }, [card.id]);

  const loadComments = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/cards/${card.id}/comments`
      );
      setComments(response.data.comments);
    } catch (error) {
      console.error("Error loading comments:", error);
    }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;

    try {
      await axios.post(`${API_URL}/api/comments`, {
        card_id: card.id,
        author: username,
        text: newComment,
      });
      setNewComment("");
      loadComments();
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  const handleSave = () => {
    onUpdate(card.id, { title, description, priority });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Edit Card</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="form-textarea"
              rows={4}
            />
          </div>

          <div className="form-group">
            <label>Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="form-select"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div className="form-group">
            <label>Comments</label>
            <div className="comments-list">
              {comments.map((comment) => (
                <div key={comment.id} className="comment">
                  <strong>{comment.author}</strong>
                  <p>{comment.text}</p>
                  <small>{new Date(comment.created_at).toLocaleString()}</small>
                </div>
              ))}
            </div>
            <div className="comment-input-group">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="form-input"
                onKeyPress={(e) => e.key === "Enter" && addComment()}
              />
              <button onClick={addComment} className="btn-primary">
                Post
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={() => onDelete(card.id)} className="btn-danger">
            Delete
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
