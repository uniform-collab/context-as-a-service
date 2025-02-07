async function print() {
  const response = await fetch(
    "http://localhost:8787/api/v1/composition?slug=demo",
    {
      headers: {
        // "quirks-segment": "gold",
        "user-id": "123",
      },
    }
  );

  const data = await response.json();
  const title = data.slots.content[0].parameters.title.value;

  console.log("Title: ", title);
}

print();
