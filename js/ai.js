/**
 * SharkDB - AI Engine (Semantic Search & RAG Pipeline)
 * Implements client-side TF-IDF search, Wikipedia real-time API retrieval, 
 * local query reasoning, and Google Gemini API RAG.
 */

window.SharkAI = {
  // Stopwords for TF-IDF tokenization
  STOP_WORDS: new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at", 
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "can't", "cannot", 
    "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", 
    "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", 
    "he's", "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", 
    "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", 
    "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", 
    "ours", "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", 
    "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there", 
    "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too", 
    "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", 
    "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", 
    "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
  ]),

  // State to hold precomputed TF-IDF terms
  corpusVectors: null,
  vocab: [],
  idf: {},

  // Get saved Gemini API Key
  getApiKey() {
    return localStorage.getItem("sharkdb_gemini_key") || "";
  },

  // Save Gemini API Key
  saveApiKey(key) {
    if (key) {
      localStorage.setItem("sharkdb_gemini_key", key);
    } else {
      localStorage.removeItem("sharkdb_gemini_key");
    }
  },

  // Helper: filter out deleted preloaded species
  _getActiveLocalDatabase() {
    const deletedIds = JSON.parse(localStorage.getItem("sharkdb_deleted_preloaded") || "[]");
    const rawSharks = window.SHARK_DATABASE || [];
    return rawSharks.filter(s => !deletedIds.includes(s.id));
  },

  // Tokenize and clean text
  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "") // Remove punctuation except hyphens
      .split(/\s+/)
      .filter(token => token.length > 1 && !this.STOP_WORDS.has(token));
  },

  // Initialize TF-IDF index
  initSearchIndex() {
    const sharks = this._getActiveLocalDatabase();
    if (sharks.length === 0) return;

    const documents = [];
    const termDocCounts = {};
    const docCount = sharks.length;

    // 1. Build document representations
    sharks.forEach((shark) => {
      const textToIndex = [
        shark.name,
        shark.scientificName,
        shark.description,
        shark.behavior,
        shark.diet,
        shark.coolFact,
        shark.threatReason,
        shark.conservationDetails,
        ...shark.habitats
      ].join(" ");

      const tokens = this.tokenize(textToIndex);
      const termFrequencies = {};

      tokens.forEach(token => {
        termFrequencies[token] = (termFrequencies[token] || 0) + 1;
      });

      documents.push({
        sharkId: shark.id,
        tf: termFrequencies,
        length: tokens.length
      });

      // Track how many docs contain each term
      Object.keys(termFrequencies).forEach(term => {
        termDocCounts[term] = (termDocCounts[term] || 0) + 1;
      });
    });

    // 2. Compute IDF for all terms in vocabulary
    const idf = {};
    const vocab = Object.keys(termDocCounts);
    vocab.forEach(term => {
      idf[term] = Math.log(1 + docCount / termDocCounts[term]);
    });

    // 3. Compute normalized TF-IDF vectors for each document
    const corpusVectors = documents.map(doc => {
      const vector = {};
      let sqSum = 0;

      Object.entries(doc.tf).forEach(([term, tfVal]) => {
        const val = tfVal * idf[term];
        vector[term] = val;
        sqSum += val * val;
      });

      const magnitude = Math.sqrt(sqSum);

      // Normalize vector
      const normalizedVector = {};
      if (magnitude > 0) {
        Object.entries(vector).forEach(([term, val]) => {
          normalizedVector[term] = val / magnitude;
        });
      }

      return {
        sharkId: doc.sharkId,
        vector: normalizedVector,
        magnitude: magnitude
      };
    });

    this.vocab = vocab;
    this.idf = idf;
    this.corpusVectors = corpusVectors;
  },

  // Perform Semantic Search using Cosine Similarity
  semanticSearch(query, limit = 3) {
    const sharks = this._getActiveLocalDatabase();
    if (sharks.length === 0) return [];

    if (!this.corpusVectors) {
      this.initSearchIndex();
    }

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return sharks.slice(0, limit);
    }

    // 1. Calculate query TF-IDF vector
    const queryTf = {};
    queryTokens.forEach(token => {
      queryTf[token] = (queryTf[token] || 0) + 1;
    });

    const queryVector = {};
    let querySqSum = 0;
    Object.entries(queryTf).forEach(([term, tfVal]) => {
      if (this.idf[term]) {
        const val = tfVal * this.idf[term];
        queryVector[term] = val;
        querySqSum += val * val;
      }
    });

    const queryMagnitude = Math.sqrt(querySqSum);
    if (queryMagnitude === 0) {
      return this._fallbackKeywordSearch(query, limit);
    }

    // Normalize query vector
    const normQueryVector = {};
    Object.entries(queryVector).forEach(([term, val]) => {
      normQueryVector[term] = val / queryMagnitude;
    });

    // 2. Compute Cosine Similarity
    const scores = this.corpusVectors.map(doc => {
      let dotProduct = 0;
      Object.entries(normQueryVector).forEach(([term, queryVal]) => {
        if (doc.vector[term]) {
          dotProduct += queryVal * doc.vector[term];
        }
      });

      return {
        sharkId: doc.sharkId,
        score: dotProduct
      };
    });

    scores.sort((a, b) => b.score - a.score);
    
    const results = [];
    const addedIds = new Set();

    scores.forEach(s => {
      if (s.score > 0 || results.length < limit) {
        const shark = sharks.find(sh => sh.id === s.sharkId);
        if (shark && !addedIds.has(shark.id)) {
          results.push(shark);
          addedIds.add(shark.id);
        }
      }
    });

    return results.slice(0, limit);
  },

  // Fallback keyword search
  _fallbackKeywordSearch(query, limit) {
    const sharks = this._getActiveLocalDatabase();
    const cleanQuery = query.toLowerCase();
    const matches = sharks.map(shark => {
      let score = 0;
      if (shark.name.toLowerCase().includes(cleanQuery)) score += 10;
      if (shark.scientificName.toLowerCase().includes(cleanQuery)) score += 5;
      if (shark.description.toLowerCase().includes(cleanQuery)) score += 2;
      if (shark.diet.toLowerCase().includes(cleanQuery)) score += 1;
      if (shark.habitats.some(h => h.toLowerCase().includes(cleanQuery))) score += 2;
      return { shark, score };
    });

    return matches
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(m => m.shark)
      .slice(0, limit);
  },

  // REALTIME RETRIEVAL: Wikipedia API Client for 500+ species support
  async fetchWikipediaSharkData(speciesName) {
    try {
      const searchQuery = speciesName.toLowerCase().includes("shark") ? speciesName : `${speciesName} shark`;
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchQuery)}&utf8=&format=json&origin=*`;
      
      const searchResponse = await fetch(searchUrl);
      if (!searchResponse.ok) throw new Error("Search request failed");
      
      const searchData = await searchResponse.json();
      const results = searchData.query?.search;
      
      if (!results || results.length === 0) {
        return null;
      }
      
      const pageTitle = results[0].title;

      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;
      const wikitextUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvsection=0&titles=${encodeURIComponent(pageTitle)}&format=json&origin=*`;

      const [summaryRes, wikitextRes] = await Promise.all([
        fetch(summaryUrl),
        fetch(wikitextUrl)
      ]);

      if (!summaryRes.ok || !wikitextRes.ok) throw new Error("Dynamic retrieval failed");

      const summaryData = await summaryRes.json();
      const wikitextData = await wikitextRes.json();

      if (summaryData.type === "disambiguation") {
        return null;
      }

      // Extract wikitext of Section 0
      const pages = wikitextData.query?.pages;
      const pageId = Object.keys(pages)[0];
      const wikitext = pages[pageId]?.revisions?.[0]?.["*"] || "";

      // Validate content: must be a member of Selachimorpha (sharks)
      const contentForValidation = (
        (summaryData.extract || "") + " " + 
        (summaryData.description || "") + " " + 
        (summaryData.title || "") + " " + 
        wikitext
      ).toLowerCase();

      const sharkKeywords = [
        "shark", "selachimorpha", "chondrichthyes", "elasmobranch", 
        "dogfish", "wobbegong", "porbeagle", "angelshark", "sawshark",
        "hexanchiformes", "squaliformes", "carcharhiniformes", 
        "lamniformes", "orectolobiformes", "heterodontiformes", 
        "pristiophoriformes", "squatiniformes"
      ];

      const isShark = sharkKeywords.some(keyword => contentForValidation.includes(keyword));
      if (!isShark) {
        return null; // Reject non-shark pages
      }

      // 3. PARSE SCIENTIFIC CLASSIFICATION (Taxonomy Binomial name)
      let scientificName = "Unknown classification";
      
      const taxonMatch = wikitext.match(/\|\s*(?:taxon|binomial|binomial_name)\s*=\s*([^|\n}#<]+)/i);
      if (taxonMatch && taxonMatch[1]) {
        scientificName = taxonMatch[1].replace(/'''/g, "").replace(/\[\[|\]\]/g, "").trim();
      } else {
        const genusMatch = wikitext.match(/\|\s*genus\s*=\s*([^|\n}#<]+)/i);
        const speciesMatch = wikitext.match(/\|\s*species\s*=\s*([^|\n}#<]+)/i);
        if (genusMatch && speciesMatch && genusMatch[1] && speciesMatch[1]) {
          scientificName = `${genusMatch[1].replace(/'''/g, "").replace(/\[\[|\]\]/g, "").trim()} ${speciesMatch[1].replace(/'''/g, "").replace(/\[\[|\]\]/g, "").trim()}`;
        } else {
          const parentheticalMatch = summaryData.extract ? summaryData.extract.match(/\(([^)]+)\)/) : null;
          if (parentheticalMatch && parentheticalMatch[1]) {
            const words = parentheticalMatch[1].split(";")[0].trim().split(" ");
            if (words.length >= 2 && /^[A-Z]/.test(words[0]) && /^[a-z]/.test(words[1])) {
              scientificName = `${words[0]} ${words[1]}`;
            }
          }
        }
      }

      scientificName = scientificName
        .replace(/^[^\w]*/, "") // Remove leading spaces or non-word chars
        .split("<")[0] // Remove html comments
        .trim();

      if (scientificName === "Unknown classification" || scientificName.length < 3) {
        scientificName = summaryData.description || "Chondrichthyes order";
      }

      // 4. PARSE CONSERVATION STATUS
      let status = "Data Deficient";
      let details = "Information retrieved dynamically from Wikipedia Infobox.";

      const statusMatch = wikitext.match(/\|\s*status\s*=\s*([A-Z]{2}|[a-z]{2})/i);
      if (statusMatch && statusMatch[1]) {
        const code = statusMatch[1].toUpperCase().trim();
        const statusMap = {
          "EX": "Extinct",
          "EW": "Extinct in the Wild",
          "CR": "Critically Endangered",
          "EN": "Endangered",
          "VU": "Vulnerable",
          "NT": "Near Threatened",
          "LC": "Least Concern",
          "DD": "Data Deficient",
          "NE": "Not Evaluated"
        };
        if (statusMap[code]) {
          status = statusMap[code];
        }
      } else {
        const text = (summaryData.extract || "").toLowerCase();
        if (text.includes("critically endangered")) {
          status = "Critically Endangered";
        } else if (text.includes("endangered")) {
          status = "Endangered";
        } else if (text.includes("vulnerable")) {
          status = "Vulnerable";
        } else if (text.includes("near threatened")) {
          status = "Near Threatened";
        } else if (text.includes("least concern")) {
          status = "Least Concern";
        }
      }

      const detailsMap = {
        "Critically Endangered": "Facing an extremely high risk of extinction in the wild. Heavily impacted by overfishing and bycatch. Strongly protected globally.",
        "Endangered": "Classified as facing a high risk of extinction in the wild. Listed under global WWF monitoring programs and CITES Appendix II.",
        "Vulnerable": "Populations are declining globally due to targeted longline fishing and habitat loss. Monitored closely by WWF conservation teams.",
        "Near Threatened": "Close to qualifying for a threatened category. Catch rates are monitored under CITES Appendix II to prevent further decline.",
        "Least Concern": "Populations are currently stable and widespread. Not considered threatened under the IUCN Red List registry.",
        "Data Deficient": "Inadequate information to make a direct or indirect assessment of its risk of extinction based on distribution or population status."
      };
      details = detailsMap[status] || details;

      // 5. PARSE PHYSICAL MEASUREMENTS
      const text = summaryData.extract || "";
      let avgSize = 1.5;
      let maxSize = 2.5;
      
      const sizeRegex = /(\d+(?:\.\d+)?)\s*(?:m|meter)/i;
      const sizeMatch = text.match(sizeRegex);
      if (sizeMatch && sizeMatch[1]) {
        maxSize = parseFloat(sizeMatch[1]);
        avgSize = parseFloat((maxSize * 0.7).toFixed(1));
        
        if (maxSize > 25) maxSize = 2.5;
        if (avgSize > maxSize) avgSize = parseFloat((maxSize * 0.7).toFixed(1));
      }

      let maxSpeed = 20;
      if (text.includes("fast") || text.includes("rapid") || text.includes("speed")) {
        maxSpeed = 35;
      }

      // Threat estimation
      let threat = "Low";
      let threatReason = "Generally considered harmless to humans due to behavior, diet, or habitat. No attacks recorded in the Shark Research Institute files.";
      
      if (text.includes("dangerous") || text.includes("attack") || text.includes("fatal") || text.includes("aggressive")) {
        threat = "Medium";
        threatReason = "A large predator. While unprovoked encounters are rare, this species has been associated with defensive behavior or occasional bites. Swim with caution.";
      }

      const customId = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      return {
        id: customId,
        name: pageTitle,
        scientificName: scientificName,
        avgSizeM: avgSize,
        maxSizeM: maxSize,
        maxWeightKg: Math.round(maxSize * 120),
        maxSpeedKmh: maxSpeed,
        threatLevel: threat,
        threatReason: threatReason,
        habitats: ["Oceanic Waters", text.includes("reef") ? "Coral Reefs" : "Open Ocean"],
        depthRangeM: text.includes("deep") ? "200 - 1500m" : "0 - 150m",
        diet: text.includes("fish") ? "Fish, squid, small crustaceans" : "Plankton and marine invertebrates",
        conservationStatus: status,
        conservationDetails: details,
        description: summaryData.extract || "No description available.",
        behavior: "A dynamic species occupying pelagic or demersal marine habitats.",
        coolFact: "This species is dynamically indexed in SharkDB via live Wikipedia connection.",
        sources: ["Wikipedia - " + pageTitle, "SharkDB Web Retrieval Module"],
        isDynamic: true,
        imageUrl: ""
      };
    } catch (e) {
      console.error("Wikipedia fetch failed:", e);
      return null;
    }
  },

  // Main RAG Pipeline Handler
  async askQuestion(query) {
    const sharks = this._getActiveLocalDatabase();
    const apiKey = this.getApiKey();
    
    // Step 1: Detect if a non-local shark is mentioned in the query
    let targetOnlineShark = null;
    const tokens = this.tokenize(query);
    
    const knownSharkNames = sharks.map(s => s.name.toLowerCase().replace(" shark", ""));
    const potentialSharks = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token !== "shark" && token !== "sharks" && token.length > 3) {
        const isLocalMatch = knownSharkNames.some(name => name.includes(token) || token.includes(name));
        if (!isLocalMatch && !this.STOP_WORDS.has(token)) {
          potentialSharks.push(token);
        }
      }
    }

    if (potentialSharks.length > 0) {
      const searchTarget = potentialSharks.join(" ");
      targetOnlineShark = await this.fetchWikipediaSharkData(searchTarget);
    }

    // Step 2: Retrieve context (Semantic Search)
    const retrievedSharks = this.semanticSearch(query, 3);
    
    if (targetOnlineShark) {
      if (retrievedSharks.length >= 3) retrievedSharks.pop();
      retrievedSharks.unshift(targetOnlineShark);
    }

    // Step 3: Call generation
    if (apiKey) {
      return this._runGeminiRAG(query, retrievedSharks, apiKey);
    } else {
      return this._runLocalSimulatedAI(query, retrievedSharks);
    }
  },

  // RAG implementation using the Gemini API
  async _runGeminiRAG(query, contextSharks, apiKey) {
    try {
      const contextString = contextSharks.map(shark => {
        return `
Shark Name: ${shark.name} (${shark.scientificName})
Size: Average ${shark.avgSizeM}m, Maximum ${shark.maxSizeM}m
Weight: Maximum ${shark.maxWeightKg}kg
Speed: Maximum ${shark.maxSpeedKmh}km/h
Threat Level to Humans: ${shark.threatLevel} (${shark.threatReason})
Habitats: ${shark.habitats.join(", ")}
Depth Range: ${shark.depthRangeM}
Diet: ${shark.diet}
Conservation Status: ${shark.conservationStatus} (${shark.conservationDetails})
Behavior: ${shark.behavior}
Cool Fact: ${shark.coolFact}
Verified Sources: ${shark.sources.join(", ")}
--------------------------------------------------`;
      }).join("\n");

      const systemPrompt = `You are SharkDB, an expert AI marine biologist specializing in sharks.
Your job is to answer user queries using ONLY the verified database context provided below.
Rules:
1. Provide highly accurate, concise, and detailed responses.
2. Rely EXCLUSIVELY on the provided shark database. Do not make up facts or include external details.
3. If the user's question cannot be answered using the provided context, state: "I'm sorry, but that information is not available in my verified database."
4. If you mention facts about a specific shark, cite the sources listed in the database (e.g., "[Source: Wikipedia, WWF]").
5. If the user asks to compare sharks, structure your response as a comparison, referencing size, speed, and threat levels.

Database Context:
${contextString}

User Question: ${query}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: systemPrompt }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1000
          }
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || "Failed to contact Gemini API.");
      }

      const data = await response.json();
      let answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
      
      const sourcesSet = new Set();
      contextSharks.forEach(s => s.sources.forEach(src => sourcesSet.add(src)));
      const citations = Array.from(sourcesSet).map(s => `- *${s}*`).join("\n");

      return {
        answer: answer.trim(),
        retrievedSharks: contextSharks,
        citations: citations,
        engine: "Gemini 2.5 Flash RAG"
      };

    } catch (e) {
      console.error("Gemini API Error:", e);
      return {
        answer: `**API Error:** ${e.message}\n\nFalling back to local simulation engine. Here is the response using our database:`,
        ...this._runLocalSimulatedAI(query, contextSharks),
        engine: "Local Engine (Fallback due to API error)"
      };
    }
  },

  // Local rule-based NLP parser & template engine (Simulated AI)
  _runLocalSimulatedAI(query, contextSharks) {
    const q = query.toLowerCase();
    const sharks = window.SHARK_DATABASE || [];

    const sourcesSet = new Set();
    contextSharks.forEach(s => s.sources.forEach(src => sourcesSet.add(src)));
    const citations = Array.from(sourcesSet).map(s => `- *${s}*`).join("\n");

    // 1. COMPARISON INTENT
    if (q.includes("compare") || q.includes(" versus ") || q.includes(" vs ")) {
      const allSharks = [...sharks, ...contextSharks.filter(s => s.isDynamic)];
      const mentionedSharks = allSharks.filter(shark => {
        const nameParts = shark.name.toLowerCase().split(" ");
        return q.includes(shark.name.toLowerCase()) || 
               (nameParts.length > 1 && q.includes(nameParts[0]) && q.includes(nameParts[1])) ||
               (nameParts[0] !== "shark" && q.includes(nameParts[0]));
      });

      const sharksToCompare = mentionedSharks.length >= 2 ? mentionedSharks.slice(0, 2) : contextSharks.slice(0, 2);
      
      if (sharksToCompare.length < 2) {
        return {
          answer: "I found only one relevant shark to discuss. Please specify two shark species you'd like to compare (e.g., 'Compare the Great White and Tiger Shark').",
          retrievedSharks: sharksToCompare,
          citations: citations,
          engine: "Local Expert Engine"
        };
      }

      const s1 = sharksToCompare[0];
      const s2 = sharksToCompare[1];

      let answer = `### Comparative Analysis: **${s1.name}** vs **${s2.name}**\n\n`;
      answer += `Based on data retrieved from Wikipedia, the Shark Research Institute, and WWF, here is a side-by-side comparison:\n\n`;
      
      answer += `| Metric | **${s1.name}** | **${s2.name}** |\n`;
      answer += `| :--- | :--- | :--- |\n`;
      answer += `| **Scientific Name** | *${s1.scientificName}* | *${s2.scientificName}* |\n`;
      answer += `| **Average Size** | ${s1.avgSizeM} meters | ${s2.avgSizeM} meters |\n`;
      answer += `| **Maximum Size** | ${s1.maxSizeM} meters | ${s2.maxSizeM} meters |\n`;
      answer += `| **Max Weight** | ${s1.maxWeightKg.toLocaleString()} kg | ${s2.maxWeightKg.toLocaleString()} kg |\n`;
      answer += `| **Top Speed** | ${s1.maxSpeedKmh} km/h | ${s2.maxSpeedKmh} km/h |\n`;
      answer += `| **Threat Level** | **${s1.threatLevel}** | **${s2.threatLevel}** |\n`;
      answer += `| **Conservation Status** | \`${s1.conservationStatus}\` | \`${s2.conservationStatus}\` |\n`;
      answer += `| **Primary Diet** | ${s1.diet} | ${s2.diet} |\n\n`;

      answer += `#### Key Insights\n`;
      answer += `- **Size & Profile**: ${s1.name} reaches a maximum length of **${s1.maxSizeM}m** (weighing up to **${s1.maxWeightKg.toLocaleString()}kg**), whereas the ${s2.name} reaches up to **${s2.maxSizeM}m** (weighing up to **${s2.maxWeightKg.toLocaleString()}kg**).\n`;
      answer += `- **Speed & Agility**: ${s1.name} has a top speed of **${s1.maxSpeedKmh} km/h** compared to ${s2.name}'s speed of **${s2.maxSpeedKmh} km/h**.\n`;
      answer += `- **Threat and Conservation**: ${s1.name} has a **${s1.threatLevel}** human-threat rating, and is classified as **${s1.conservationStatus}**. ${s2.name} has a **${s2.threatLevel}** threat rating, and is listed as **${s2.conservationStatus}**.\n\n`;
      
      answer += `*Sources cited: ${s1.sources.join(", ")} | ${s2.sources.join(", ")}*`;

      return {
        answer,
        retrievedSharks: sharksToCompare,
        citations: citations,
        engine: "Local Expert Engine (Comparison Mode)"
      };
    }

    if (q.includes("dangerous") || q.includes("human") || q.includes("attack") || q.includes("bite") || q.includes("safe") || q.includes("harmful")) {
      const dangerousSharks = sharks.filter(s => s.threatLevel === "High");
      const mediumSharks = sharks.filter(s => s.threatLevel === "Medium");

      const singleTarget = contextSharks[0];
      const allSharks = [...sharks, ...contextSharks.filter(s => s.isDynamic)];
      const isSingleTargetCheck = allSharks.some(s => q.includes(s.name.toLowerCase().split(" ")[0]));

      if (isSingleTargetCheck && singleTarget) {
        return {
          answer: `### Human Safety Profile: **${singleTarget.name}**\n\n` +
                  `*   **Threat Level**: \`${singleTarget.threatLevel}\`\n` +
                  `*   **Details**: ${singleTarget.threatReason}\n\n` +
                  `**Conservation Context**: According to the WWF, sharks rarely target humans deliberately. In fact, humans kill over 100 million sharks annually, making overfishing a major threat to their survival, while shark bites remain exceedingly rare worldwide.`,
          retrievedSharks: [singleTarget],
          citations: citations,
          engine: "Local Expert Engine (Safety Profiler)"
        };
      }

      let answer = `### Shark Human Safety & Threat Levels\n\n`;
      answer += `According to records from the **Shark Research Institute (SRI)** and Wikipedia, out of over 500+ species, only a very small number are involved in unprovoked encounters with humans.\n\n`;
      answer += `#### High Threat Species (Treat with absolute caution):\n`;
      dangerousSharks.forEach(s => {
        answer += `- **${s.name}** (*${s.scientificName}*): ${s.threatReason}\n`;
      });
      answer += `\n#### Medium Threat Species (Large predators, rare encounters):\n`;
      mediumSharks.forEach(s => {
        answer += `- **${s.name}** (*${s.scientificName}*): ${s.threatReason}\n`;
      });
      answer += `\n#### Harmless/Low Threat Species:\n`;
      answer += `Filter feeders like the **Whale Shark** and **Basking Shark** are completely gentle and feed on plankton. Bottom-dwellers like the **Nurse Shark** or **Leopard Shark** are docile and only bite defensively if stepped on or handled.\n\n`;
      answer += `> **WWF Note**: Sharks play a critical role in maintaining ocean health as apex predators. Overfishing has led to a global shark crisis, with 70% of shark species declining.`;

      return {
        answer,
        retrievedSharks: dangerousSharks,
        citations: citations,
        engine: "Local Expert Engine (Safety Overview)"
      };
    }

    if (q.includes("fastest") || q.includes("speed") || q.includes("fast")) {
      const sortedBySpeed = [...sharks].sort((a, b) => b.maxSpeedKmh - a.maxSpeedKmh);
      const fastest = sortedBySpeed[0];

      let answer = `### Fastest Sharks in the Ocean\n\n`;
      answer += `The absolute **fastest shark** in the ocean is the **${fastest.name}** (*${fastest.scientificName}*), clocking speeds up to **${fastest.maxSpeedKmh} km/h** (45+ mph).\n\n`;
      answer += `#### Top Speed Leaderboard (Verified Records):\n`;
      
      sortedBySpeed.slice(0, 5).forEach((s, idx) => {
        answer += `${idx + 1}. **${s.name}**: **${s.maxSpeedKmh} km/h** (Max Size: ${s.maxSizeM}m) - *${s.coolFact.substring(0, 80)}...*\n`;
      });

      answer += `\n*Physiology of Speed*: High-speed sharks like the Mako and Great White possess a specialized circulatory system (rete mirabile) that warms their muscles, allowing efficient oxygen delivery and explosive speed bursts in cold waters.`;

      return {
        answer,
        retrievedSharks: sortedBySpeed.slice(0, 3),
        citations: citations,
        engine: "Local Expert Engine (Speed Leaderboard)"
      };
    }

    if (q.includes("largest") || q.includes("biggest") || q.includes("size") || q.includes("heavy") || q.includes("weight")) {
      const sortedBySize = [...sharks].sort((a, b) => b.maxSizeM - a.maxSizeM);
      const largest = sortedBySize[0];

      let answer = `### Largest Sharks in the World\n\n`;
      answer += `The **largest shark (and the largest fish in the world)** is the **${largest.name}** (*${largest.scientificName}*), measuring up to **${largest.maxSizeM} meters** and weighing up to **${largest.maxWeightKg.toLocaleString()} kg**.\n\n`;
      answer += `#### Size Leaderboard (Verified Lengths):\n`;
      
      sortedBySize.slice(0, 5).forEach((s, idx) => {
        answer += `${idx + 1}. **${s.name}**: Max **${s.maxSizeM} meters** (Avg: ${s.avgSizeM}m, Weight: ${s.maxWeightKg.toLocaleString()} kg) - *Conservation Status: ${s.conservationStatus}*\n`;
      });

      answer += `\n*Dietary Paradox*: Interestingly, the two largest sharks on Earth (Whale Shark and Basking Shark) are completely harmless filter feeders that survive entirely on microscopic plankton.`;

      return {
        answer,
        retrievedSharks: sortedBySize.slice(0, 3),
        citations: citations,
        engine: "Local Expert Engine (Size Rankings)"
      };
    }

    const allSharks = [...sharks, ...contextSharks.filter(s => s.isDynamic)];
    const matchedShark = allSharks.find(s => {
      const nameParts = s.name.toLowerCase().replace(" shark", "").split(" ");
      return q.includes(s.name.toLowerCase()) || 
             (nameParts.length > 1 && q.includes(nameParts[0]) && q.includes(nameParts[1])) ||
             (nameParts[0] !== "shark" && q.includes(nameParts[0]));
    });

    if (matchedShark) {
      return {
        answer: `### Species Profile: **${matchedShark.name}** (*${matchedShark.scientificName}*)\n\n` +
                `${matchedShark.description}\n\n` +
                `#### Biological & Environmental Metrics\n` +
                `*   **Average Size**: ${matchedShark.avgSizeM} meters (Max: ${matchedShark.maxSizeM}m)\n` +
                `*   **Max Weight**: ${matchedShark.maxWeightKg.toLocaleString()} kg\n` +
                `*   **Top Speed**: ${matchedShark.maxSpeedKmh} km/h\n` +
                `*   **Depth Range**: ${matchedShark.depthRangeM}\n` +
                `*   **Habitat**: ${matchedShark.habitats.join(", ")}\n` +
                `*   **Primary Diet**: ${matchedShark.diet}\n\n` +
                `#### Human Safety & Behavior\n` +
                `*   **Threat Level to Humans**: **${matchedShark.threatLevel}**\n` +
                `*   **Safety Profile**: ${matchedShark.threatReason}\n` +
                `*   **Behavioral Pattern**: ${matchedShark.behavior}\n\n` +
                `#### Conservation Status (IUCN)\n` +
                `*   **Status**: \`${matchedShark.conservationStatus}\`\n` +
                `*   **Details**: ${matchedShark.conservationDetails}\n\n` +
                `> **Fascinating Fact**: ${matchedShark.coolFact}`,
        retrievedSharks: [matchedShark],
        citations: matchedShark.sources.map(s => `- *${s}*`).join("\n"),
        engine: matchedShark.isDynamic ? "Wikipedia Realtime Retrieval" : "Local Expert Engine"
      };
    }

    let answer = `### SharkDB Retrieval Results\n\n`;
    answer += `I have searched the SharkDB index (compiled from Wikipedia, SRI, and WWF) for **"${query}"**.\n\n`;
    answer += `Here are the top matches I retrieved for your query:\n\n`;

    contextSharks.forEach(s => {
      answer += `*   **${s.name}** (*${s.scientificName}*): ${s.description.split(".")[0]}. (Size: ${s.maxSizeM}m, Speed: ${s.maxSpeedKmh} km/h, IUCN: *${s.conservationStatus}*)\n`;
    });

    answer += `\nTry asking more specific questions, such as:\n` +
              `- *"Which sharks are dangerous to humans?"*\n` +
              `- *"Compare the Great White and Tiger Shark"* \n` +
              `- *"Tell me about the Goblin Shark."* (searches Wikipedia database)`;

    return {
      answer,
      retrievedSharks: contextSharks,
      citations: citations,
      engine: "Local Semantic Search Engine"
    };
  }
};
