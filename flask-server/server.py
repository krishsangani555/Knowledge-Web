from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import requests
import json
import os
import io
import sqlite3
from datetime import datetime
from functools import lru_cache
import asyncio
import concurrent.futures

app = Flask(__name__)
CORS(app)

# Database setup
DATABASE = 'knowledge_web.db'

def init_db():
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        # Create tables if they don't exist
        c.execute('''
            CREATE TABLE IF NOT EXISTS trees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tree_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Check if we have any trees, if not insert the initial tree
        c.execute('SELECT COUNT(*) FROM trees')
        if c.fetchone()[0] == 0:
            initial_tree = {
                "name": "All Topics"
            }
            c.execute('INSERT INTO trees (tree_data) VALUES (?)', 
                     (json.dumps(initial_tree),))
        conn.commit()

# Initialize database
init_db()

# Add these configurations
IMAGES_DIR = "topic_images"
if not os.path.exists(IMAGES_DIR):
    os.makedirs(IMAGES_DIR)

# Pixabay API key
PIXABAY_API_KEY = "48002111-e0c13038ffe6476427bbf5032"

# Dictionary to track original topic names
topic_origins = {}

def get_current_tree():
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('SELECT tree_data FROM trees ORDER BY created_at DESC LIMIT 1')
        result = c.fetchone()
        return json.loads(result[0]) if result else {"name": "All Topics"}

def save_tree(tree_data):
    with sqlite3.connect(DATABASE) as conn:
        c = conn.cursor()
        c.execute('INSERT INTO trees (tree_data) VALUES (?)', 
                 (json.dumps(tree_data),))
        conn.commit()

# Update the routes to use database
@app.route("/update-tree", methods=["POST"])
def update_tree():
    updated_data = request.json
    save_tree(updated_data)
    return jsonify({"status": "success", "data": updated_data})

@app.route("/reset-tree", methods=["POST"])
def reset_tree():
    global topic_origins
    initial_tree = {"name": "All Topics"}
    save_tree(initial_tree)
    topic_origins = {}
    return jsonify({"status": "success", "data": initial_tree})

@app.route("/tree", methods=["GET"])
def get_tree():
    current_tree = get_current_tree()
    return jsonify(current_tree)

# Function to query Ollama
def query_ollama(prompt, model="llama3.1"):
    url = "http://localhost:11434/api/generate"
    
    data = {
        "model": model,
        "prompt": prompt + "\nProvide only the requested information without any additional text or formatting."
    }
    
    try:
        response = requests.post(url, json=data)
        full_response = ""
        
        for line in response.iter_lines():
            if line:
                try:
                    json_response = json.loads(line.decode('utf-8'))
                    if 'response' in json_response:
                        full_response += json_response['response']
                except json.JSONDecodeError:
                    print(f"Error decoding JSON: {line}")
        
        # Clean up the response
        cleaned_response = full_response.strip()
        
        # For node-click (list of topics)
        if "list" in prompt.lower():
            try:
                # Try to extract items from a Python list format
                items = eval(cleaned_response)
                if isinstance(items, list):
                    return str(items)
                # If not a valid list, try to extract items another way
                items = [item.strip() for item in cleaned_response.replace('[', '').replace(']', '').split(',')]
                return str(items[:5])  # Ensure we only return 5 items
            except:
                # If all else fails, split by newlines and clean up
                items = [item.strip() for item in cleaned_response.split('\n') if item.strip()]
                return str(items[:5])  # Ensure we only return 5 items
        
        # For other responses (paragraphs)
        return cleaned_response or "Error generating content"

    except Exception as e:
        print(f"Error querying Ollama: {e}")
        return "Error generating content"

# Function to get image from Pixabay
def get_topic_image(topic):
    image_path = os.path.join(IMAGES_DIR, f"{topic}.jpg")
    
    # Check if image already exists
    if os.path.exists(image_path):
        print(f"Using cached image for {topic}")
        return image_path
    
    try:
        # Use Pixabay API to search for an image
        pixabay_url = "https://pixabay.com/api/"
        params = {
            'key': PIXABAY_API_KEY,
            'q': topic.replace(" ", "+"),  # Handle spaces in search
            'image_type': 'photo',
            'orientation': 'horizontal',
            'per_page': 3,
            'safesearch': True,
            'min_width': 800,  # Ensure decent image quality
            'min_height': 600
        }
        
        print(f"Searching Pixabay for: {topic}")
        response = requests.get(pixabay_url, params=params)
        
        if response.status_code != 200:
            print(f"Pixabay API error: {response.status_code}")
            return None
            
        data = response.json()
        
        if not data.get('hits'):
            print(f"No images found for: {topic}")
            # Try with a more general search by taking first word
            general_topic = topic.split()[0]
            if general_topic != topic:
                print(f"Trying more general search: {general_topic}")
                params['q'] = general_topic
                response = requests.get(pixabay_url, params=params)
                data = response.json()
        
        if data.get('hits'):
            # Get the first image URL
            image_url = data['hits'][0]['largeImageURL']
            print(f"Found image URL: {image_url}")
            
            # Download and save the image
            image_response = requests.get(image_url)
            if image_response.status_code == 200:
                with open(image_path, 'wb') as f:
                    f.write(image_response.content)
                print(f"Successfully saved image for {topic}")
                return image_path
            else:
                print(f"Failed to download image: {image_response.status_code}")
        else:
            print(f"No images found for topic: {topic}")
            
    except Exception as e:
        print(f"Error getting image for {topic}: {e}")
        return None

    return None

# Add caching to expensive operations
@lru_cache(maxsize=100)
def query_ollama_cached(prompt, model="llama3.1"):
    return query_ollama(prompt, model)

# Optimize the node-click route
@app.route('/node-click', methods=['POST'])
def node_click():
    data = request.get_json()
    node_name = data.get('name')
    
    # Use cached response if available
    prompt = f"""Generate exactly 5 short, specific topics related to '{node_name}'.
    Format as a Python list of strings.
    Example format: ['Topic 1', 'Topic 2', 'Topic 3', 'Topic 4', 'Topic 5']
    Keep topics concise and relevant."""
    
    new_node_names = query_ollama_cached(prompt)
    
    try:
        topics = eval(new_node_names)
        for topic in topics:
            topic_origins[topic] = node_name
    except:
        print("Error parsing topics for origin tracking")
    
    return jsonify({"name": new_node_names})

# Optimize the node-detail route
@app.route('/node-detail', methods=['POST'])
def node_detail():
    try:
        data = request.json
        node_name = data.get('name')
        original_topic = topic_origins.get(node_name, node_name)

        # Run title and content generation concurrently
        with concurrent.futures.ThreadPoolExecutor() as executor:
            title_future = executor.submit(
                query_ollama_cached,
                f"""Generate a proper article title for '{node_name}'.
                Make it engaging but factual, like a Wikipedia article title.
                Return only the title, no additional text."""
            )
            
            content_future = executor.submit(
                query_ollama_cached,
                f"""Create a comprehensive article about '{node_name}'..."""
            )

            # Start image fetch in parallel
            executor.submit(get_topic_image, original_topic)

            title = title_future.result().strip()
            content = content_future.result()

        if not title or len(title) < 3:
            title = f"Understanding {node_name}"

        return jsonify({
            "title": title,
            "content": content,
            "originalTopic": original_topic
        })

    except Exception as e:
        print(f"Error in node_detail: {e}")
        return jsonify({
            "title": f"About {node_name}",
            "content": "Content generation failed. Please try again.",
            "originalTopic": node_name
        }), 500

# Route to serve images
@app.route('/topic-image/<topic>', methods=['GET'])
def get_topic_image_route(topic):
    try:
        # Use original topic for image lookup
        original_topic = topic_origins.get(topic, topic)
        print(f"Getting image for topic: {original_topic} (original from: {topic})")
        
        image_path = os.path.join(IMAGES_DIR, f"{original_topic}.jpg")
        
        # If image doesn't exist, get it using the original topic
        if not os.path.exists(image_path):
            image_path = get_topic_image(original_topic)
            if not image_path:
                print(f"No image found for {original_topic}")
                # Return a default image or 404
                return "Image not found", 404
        
        return send_file(image_path, mimetype='image/jpeg')
    except Exception as e:
        print(f"Error serving image: {e}")
        return "Error serving image", 500

@app.route('/generate-annotation', methods=['POST'])
def generate_annotation():
    data = request.get_json()
    selected_text = data.get('text')
    topic = data.get('topic')
    
    print(f"Generating annotation for topic: {topic}")
    print(f"Selected text: {selected_text}")
    
    prompt = f"""Provide a brief, focused explanation of this excerpt in the context of {topic}:
    "{selected_text}"
    
    Rules:
    - Keep the explanation to 1-2 short sentences
    - Focus on the key insight or main point
    - Use simple, clear language
    - Maximum 50 words
    
    Explain it as if summarizing for a quick note."""
    
    try:
        explanation = query_ollama_cached(prompt)
        print(f"Generated annotation: {explanation}")
        return jsonify({
            "annotation": explanation
        })
    except Exception as e:
        print(f"Error generating annotation: {e}")
        return jsonify({
            "annotation": "Failed to generate explanation. Please try again."
        }), 500

if __name__ == "__main__":
    app.run(port=9000, debug=True)
