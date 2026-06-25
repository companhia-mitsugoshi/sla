const admin = require('firebase-admin');

// Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}
const db = admin.firestore();

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const apiKey = process.env.GROQ_API_KEY;
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: 'JSON inválido' };
  }

  const { messages } = payload;
  const userQuery = messages[messages.length - 1].content; // A última pergunta do cliente

  try {
    // --- PASSO 1: BUSCA INTELIGENTE NO FIRESTORE ---
    // Vamos extrair palavras-chave da pergunta para buscar no banco
    const keywords = userQuery.toLowerCase().split(' ').filter(w => w.length > 3);
    
    let relevantDragons = [];
    
    if (keywords.length > 0) {
      // Busca no Firestore dragões cujo nome comece com as palavras-chave
      // Nota: O Firestore é limitado em buscas de texto. 
      // Para melhor resultado, buscamos os primeiros 10 que batem com a raridade ou nome.
      const snapshot = await db.collection('dragons')
        .where('tags', 'array-contains-any', keywords.slice(0, 10)) 
        .limit(10)
        .get();

      snapshot.forEach(doc => relevantDragons.push(doc.data()));
    }

    // Se não achou nada específico, pega os 5 dragões em destaque (opcional)
    if (relevantDragons.length === 0) {
      const featured = await db.collection('dragons').limit(5).get();
      featured.forEach(doc => relevantDragons.push(doc.data()));
    }

    // Formata os dados encontrados para a IA
    const contextSummary = relevantDragons.map(d => 
      `- ${d.nome} (Raridade: ${d.raridade}, Esferas: ${d.esferas}, Preço: ${d.preco})`
    ).join('\n');

    // --- PASSO 2: CHAMADA PARA A GROQ ---
    const systemPrompt = `Você é o atendente da Mitsugoshi. 
Com base na pergunta do cliente, eu encontrei estes dragões no nosso banco de dados:
${contextSummary}

Instruções:
1. Use APENAS as informações acima para responder.
2. Se o dragão que ele quer não estiver na lista acima, diga que não encontrei no momento, mas sugira um desses acima.
3. Responda de forma curta e amigável em português.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-5), // Envia as últimas 5 mensagens para contexto
        ],
        temperature: 0.5,
      }),
    });

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || 'Não consegui processar sua dúvida.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno' }) };
  }
};