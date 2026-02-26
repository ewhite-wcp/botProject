require("dotenv").config()
const express = require("express")
const crypto = require("crypto")
const fs = require("fs")

const app = express()

// IMPORTANT: need raw body for signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf
    }
  })
)

const pokemonList = JSON.parse(
  fs.readFileSync("./pokemon.json", "utf-8")
)

// -----------------------------
// Weighted Random Selection
// -----------------------------
function getRandomPokemon(list) {
  const totalWeight = list.reduce((sum, p) => sum + p.weight, 0)
  let random = Math.random() * totalWeight

  for (const pokemon of list) {
    if (random < pokemon.weight) {
      return pokemon
    }
    random -= pokemon.weight
  }
}

// -----------------------------
// Verify GitHub Signature
// -----------------------------
function verifySignature(req) {
  const signature = req.headers["x-hub-signature-256"]
  if (!signature) return false

  const hmac = crypto.createHmac("sha256", process.env.GITHUB_SECRET)
  const digest =
    "sha256=" + hmac.update(req.rawBody).digest("hex")

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  )
}

// -----------------------------
// Main Webhook Endpoint
// -----------------------------
app.post("/github-webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) {
      return res.status(401).send("Invalid signature")
    }

    const body = req.body

    // Only act on PR approval
    if (
      body.action === "submitted" &&
      body.review?.state === "approved"
    ) {
      const username = body.pull_request.user.login
      const prTitle = body.pull_request.title
      const prUrl = body.pull_request.html_url

      const pokemon = getRandomPokemon(pokemonList)

      const rarityEmoji = {
        common: "⚪",
        uncommon: "🟢",
        rare: "🔵",
        legendary: "🟣✨"
      }

      const message = `${rarityEmoji[pokemon.rarity]} 🎉 ${username} caught a ${pokemon.name} for getting a PR approved!\n\nPR: ${prTitle}\n${prUrl}`

      await fetch(process.env.TEAMS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: message
        })
      })

      console.log("Posted to Teams:", message)
    }

    res.status(200).send("OK")
  } catch (err) {
    console.error(err)
    res.status(500).send("Error")
  }
})

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`)
})
