# SharkDB - Scientific Shark Database & Bio-Agent

SharkDB is a modern, responsive Single Page Application (SPA) designed to help marine biology enthusiasts and researchers explore shark species, analyze comparative physiological traits, and consult a Retrieval-Augmented Generation (RAG) assistant.

All scientific parameters and status indications in this app are sourced directly from reliable organizations—including **Wikipedia**, the **Shark Research Institute (SRI)**, and the **World Wildlife Fund (WWF)**—ensuring high factual fidelity.

---

## Key Features

*   **500+ Shark Species Support (Real-Time Retrieval)**:
    *   Pre-loads 15 featured species.
    *   Integrates the **Wikimedia REST API** to fetch scientific summaries, binomial names, and images for *any* known shark species in real time.
    *   Alerts users to the fact that hundreds of deep-sea shark species remain unclassified, encouraging future discovery.
*   **Factual Retrieval-Augmented Generation (RAG) Chatbot**:
    *   *Offline Expert Engine*: Processes common natural language intents (comparisons, safety, size, speed) on the client side using regex classification, generating structured markdown responses (including side-by-side comparison tables) without network latency.
    *   *Gemini 2.5 Flash RAG*: Toggleable mode that integrates a user-provided Gemini API Key. Sends semantic contexts (retrieved via TF-IDF cosine similarity and Wikipedia fetches) alongside strict system prompts to generate accurate, non-hallucinated natural responses.
*   **TF-IDF Semantic Search**: Tokenizes user search queries, filters standard stop words, and scores document relevance using cosine similarity.
*   **Visual Analytics**: Implements responsive, interactive charts mapping speeds, sizes, and conservation distributions via `Chart.js`.
*   **Profile Portability (JSON Backup/Restore)**: Export your account profile, bookmarked species, and chat history as a JSON file, and restore it on any other deployed instance.
*   **Modern Responsive Interface**: Beautiful dark "deep ocean" aesthetic featuring glassmorphism elements, micro-animations, glowing borders, custom scrollbars, and fluid layout scaling for mobile screens.

---

## Technology Stack

1.  **Frontend Core**: HTML5 Semantic Elements, ES6+ Vanilla JavaScript.
2.  **Styling**: Custom CSS variables, responsive grid/flex systems, backdrop-filters, custom keyframes.
3.  **Visualization**: Chart.js (v4.x) served via CDN.
4.  **Icons**: Font Awesome (v6.4.0) served via CDN.
5.  **External API**: Wikimedia REST API (CORS-free, no key required).
6.  **Data Source Reference**: Wikipedia, Shark Research Institute (SRI), World Wildlife Fund (WWF).

---

## Project Structure

```
sharkdb/
├── index.html          # Main SPA template structure & modals
├── vercel.json         # Vercel deployment routing configuration
├── deploy.md           # Step-by-step static web deployment guide
├── css\
│   └── style.css       # Deep ocean theme variables, layout styling & animations
└── js\
    ├── database.js     # Structured database of 15 shark species
    ├── auth.js         # LocalStorage user registry, session & backup export/import
    ├── ai.js           # TF-IDF calculations, Wikipedia fetches & RAG chatbot processing
    └── app.js          # Route routing, explore filters, charts mapping & event controllers
```

---

## AI Pipeline & Retrieval Architecture

```
                    +-----------------------+
                    |  User Natural Query   |
                    +-----------+-----------+
                                |
                                v
                    +-----------------------+
                    |  Tokenize & Clean     | (Removes Stopwords)
                    +-----------+-----------+
                                |
                                v
                    +-----------------------+
                    | Is non-local species? | (Checks local database)
                    +-----------+-----------+
                                |
             +------------------+------------------+
             | Yes                                 | No
             v                                     v
  +-----------------------+             +-----------------------+
  | Wikipedia REST API    |             |  TF-IDF Cosine Match  |
  | Summary Dynamic Fetch |             |  Local Database       |
  +-----------+-----------+             +-----------+-----------+
              |                                     |
              +------------------+------------------+
                                 |
                                 v
                    +-----------------------+
                    |  Context Generation   | (3 structured records)
                    +-----------+-----------+
                                |
             +------------------+------------------+
             |                                     |
             v (If Key Exists)                     v (If No Key)
  +-----------------------+             +-----------------------+
  |  Gemini 2.5 Flash API |             | Local Expert Engine   |
  |  Prompt Context + RAG |             | Pattern Regex Parser  |
  +-----------+-----------+             +-----------+-----------+
              |                                     |
              +------------------+------------------+
                                 |
                                 v
                    +-----------------------+
                    | Factual Markdown Res  | (Zero Hallucination)
                    +-----------------------+
```
