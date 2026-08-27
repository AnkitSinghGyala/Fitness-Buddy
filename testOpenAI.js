const { OpenAI } = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function test() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Hello world" }],
    });
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error("OpenAI test error:", error.response ? error.response.data : error.message);
  }
}

test();