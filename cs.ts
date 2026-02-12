// ClaudeScript header extraction utility
// Usage: bun cs.ts <file> [--replace]
//   No flags: prints the @cs header
//   --replace: spawns a sub-agent to compile header into full code, replaces code below @/cs

const file = Bun.argv[2]
if (!file) {
  console.error("Usage: bun cs.ts <file> [--replace]")
  process.exit(1)
}

const content = await Bun.file(file).text()
const csStart = content.indexOf("// @cs")
const csEnd = content.indexOf("// @/cs")

if (csStart === -1 || csEnd === -1) {
  console.error("No @cs/@/cs block found in", file)
  process.exit(1)
}

const header = content.slice(csStart, csEnd + "// @/cs".length)

if (Bun.argv[3] === "--replace") {
  // Output header + everything before @cs (HTML/CSS preamble)
  // The sub-agent will need both to generate correct code
  const preamble = content.slice(0, csStart)
  const afterMarker = content.slice(csEnd + "// @/cs".length)
  // Find where the code ends (</script>) to know what to replace
  const scriptEnd = afterMarker.indexOf("</script>")
  const postScript = scriptEnd !== -1 ? afterMarker.slice(scriptEnd) : ""

  console.log("=== PREAMBLE ===")
  console.log(preamble.trim())
  console.log("\n=== HEADER ===")
  console.log(header)
  console.log("\n=== POST ===")
  console.log(postScript.trim())
} else {
  console.log(header)
}
