exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const { imageBase64 } = JSON.parse(event.body);
    const cleanBase = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const params = new URLSearchParams();
    params.append('image', cleanBase);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
      method: 'POST',
      body: params
    });

    const data = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ url: data.data.url }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};