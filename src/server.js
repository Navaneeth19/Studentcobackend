require("dotenv").config();
const { createApp } = require("./app");

const PORT = Number(process.env.PORT || 5000);
const app = createApp();

app.listen(PORT, () => {
  console.log(`StudentCo backend listening on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
