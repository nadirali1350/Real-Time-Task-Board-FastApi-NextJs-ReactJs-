from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional, Dict, Set
import json
import uuid
from datetime import datetime

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with database in production)
boards: Dict[str, dict] = {}
columns: Dict[str, List[dict]] = {}
cards: Dict[str, dict] = {}
comments: Dict[str, List[dict]] = {}
active_connections: Set[WebSocket] = set()

# Models
class Board(BaseModel):
    name: str
    description: Optional[str] = ""

class Column(BaseModel):
    board_id: str
    name: str
    position: int

class Card(BaseModel):
    column_id: str
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "medium"
    labels: Optional[List[str]] = []
    assigned_to: Optional[str] = ""

class Comment(BaseModel):
    card_id: str
    author: str
    text: str

class MoveCard(BaseModel):
    card_id: str
    target_column_id: str
    position: int

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.add(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            self.active_connections.discard(conn)

manager = ConnectionManager()

# Initialize default board
def init_default_data():
    board_id = str(uuid.uuid4())
    boards[board_id] = {
        "id": board_id,
        "name": "My Task Board",
        "description": "Collaborative task management",
        "created_at": datetime.now().isoformat()
    }
    
    # Create default columns
    column_names = ["To Do", "In Progress", "Done"]
    for i, name in enumerate(column_names):
        col_id = str(uuid.uuid4())
        if board_id not in columns:
            columns[board_id] = []
        columns[board_id].append({
            "id": col_id,
            "board_id": board_id,
            "name": name,
            "position": i
        })

init_default_data()

# API Endpoints
@app.get("/")
async def root():
    return {"message": "Task Board API"}

@app.get("/api/boards")
async def get_boards():
    return {"boards": list(boards.values())}

@app.get("/api/boards/{board_id}")
async def get_board(board_id: str):
    if board_id not in boards:
        raise HTTPException(status_code=404, detail="Board not found")
    
    board_columns = columns.get(board_id, [])
    board_data = boards[board_id].copy()
    board_data["columns"] = []
    
    for col in sorted(board_columns, key=lambda x: x["position"]):
        col_cards = [c for c in cards.values() if c["column_id"] == col["id"]]
        col_data = col.copy()
        col_data["cards"] = sorted(col_cards, key=lambda x: x["position"])
        board_data["columns"].append(col_data)
    
    return board_data

@app.post("/api/boards")
async def create_board(board: Board):
    board_id = str(uuid.uuid4())
    boards[board_id] = {
        "id": board_id,
        "name": board.name,
        "description": board.description,
        "created_at": datetime.now().isoformat()
    }
    await manager.broadcast({"type": "board_created", "data": boards[board_id]})
    return boards[board_id]

@app.post("/api/columns")
async def create_column(column: Column):
    col_id = str(uuid.uuid4())
    if column.board_id not in columns:
        columns[column.board_id] = []
    
    new_column = {
        "id": col_id,
        "board_id": column.board_id,
        "name": column.name,
        "position": column.position
    }
    columns[column.board_id].append(new_column)
    await manager.broadcast({"type": "column_created", "data": new_column})
    return new_column

@app.post("/api/cards")
async def create_card(card: Card):
    card_id = str(uuid.uuid4())
    
    # Get position for new card
    col_cards = [c for c in cards.values() if c["column_id"] == card.column_id]
    position = len(col_cards)
    
    new_card = {
        "id": card_id,
        "column_id": card.column_id,
        "title": card.title,
        "description": card.description,
        "priority": card.priority,
        "labels": card.labels,
        "assigned_to": card.assigned_to,
        "position": position,
        "created_at": datetime.now().isoformat()
    }
    cards[card_id] = new_card
    await manager.broadcast({"type": "card_created", "data": new_card})
    return new_card

@app.put("/api/cards/{card_id}")
async def update_card(card_id: str, card: Card):
    if card_id not in cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    cards[card_id].update({
        "title": card.title,
        "description": card.description,
        "priority": card.priority,
        "labels": card.labels,
        "assigned_to": card.assigned_to,
    })
    await manager.broadcast({"type": "card_updated", "data": cards[card_id]})
    return cards[card_id]

@app.post("/api/cards/move")
async def move_card(move: MoveCard):
    if move.card_id not in cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card = cards[move.card_id]
    old_column = card["column_id"]
    
    # Update card position
    card["column_id"] = move.target_column_id
    card["position"] = move.position
    
    # Reorder cards in both columns
    for c in cards.values():
        if c["column_id"] == old_column and c["id"] != move.card_id:
            if c["position"] > card["position"]:
                c["position"] -= 1
    
    await manager.broadcast({"type": "card_moved", "data": card})
    return card

@app.delete("/api/cards/{card_id}")
async def delete_card(card_id: str):
    if card_id not in cards:
        raise HTTPException(status_code=404, detail="Card not found")
    
    deleted_card = cards.pop(card_id)
    if card_id in comments:
        del comments[card_id]
    
    await manager.broadcast({"type": "card_deleted", "data": {"id": card_id}})
    return {"message": "Card deleted"}

@app.post("/api/comments")
async def create_comment(comment: Comment):
    comment_id = str(uuid.uuid4())
    if comment.card_id not in comments:
        comments[comment.card_id] = []
    
    new_comment = {
        "id": comment_id,
        "card_id": comment.card_id,
        "author": comment.author,
        "text": comment.text,
        "created_at": datetime.now().isoformat()
    }
    comments[comment.card_id].append(new_comment)
    await manager.broadcast({"type": "comment_created", "data": new_comment})
    return new_comment

@app.get("/api/cards/{card_id}/comments")
async def get_comments(card_id: str):
    return {"comments": comments.get(card_id, [])}

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo received messages to all clients
            message = json.loads(data)
            await manager.broadcast(message)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)