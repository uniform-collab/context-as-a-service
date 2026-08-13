async function print() {
  const response = await fetch(
    "http://localhost:8787/api/v1/route?path=/",
    {
      method: process.env.USE_POST_BODY === "true" ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        // GET fallback: CDP profile lookup
        "visitor-id": "123",
      },
      body:
        process.env.USE_POST_BODY === "true"
          ? JSON.stringify({
              quirks: { audience: "golf", hasReservation: "false" },
              device: { os: "ios" },
            })
          : undefined,
    }
  );

  const data = await response.json();
  const title = data.slots.content[0].parameters.title.value;

  console.log("Title: ", title);
}

print();
