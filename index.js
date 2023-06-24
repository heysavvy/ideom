const fs = require("fs");
const yaml = require("js-yaml");
const fetch = require("node-fetch");
const pdfjs = require("pdfjs-dist");
const { set } = require("lodash");
const get = require("lodash/get");
const lancedb = require("vectordb");
const { Configuration, OpenAIApi } = require("openai");
const readline = require("readline/promises");
const { OpenAIEmbeddings } = require("langchain/embeddings/openai");

require("dotenv").config();
const { stdin: input, stdout: output } = require("process");

// Load the YAML file
const filePath = "processes/get_manifesto_pledges.yml";
const yamlContent = fs.readFileSync(filePath, "utf8");

// Parse the YAML into a JavaScript object
const config = yaml.load(yamlContent);

const allStepData = {};

// Process the main steps
processSteps(config.processes.get_manifesto_pledges.steps).then((stepData) => {
  console.log("stepData:\n", JSON.stringify(stepData, null, 2));
});

// Process the steps
async function processSteps(steps, localStepData) {
  const stepData = localStepData || allStepData;
  for (const step of steps) {
    // Wait 1s
    // await new Promise((resolve) => setTimeout(resolve, 500));
    stepData[step.key] = {
      outputs: {},
    };
    switch (step.type) {
      case "loop":
        const items = replacePlaceholders(step.with.items);
        console.log(`Looping over items: ${items}`, typeof items);
        stepData[step.key].inputs = items;
        stepData[step.key].items = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log(`Loop - item: ${item}`);
          stepData[step.key].current_step = { item, steps: {} };
          const innerSteps = await processSteps(
            step.steps,
            stepData[step.key].current_step.steps
          );
          stepData[step.key].items.push({ item, steps: innerSteps });
        }
        // delete stepData[step.key].current_step;
        break;
      case "load_input_data":
        console.log(`Loading input data: ${step.with.input_key}`);
        const listData = await loadInputData(step.with.input_key);
        stepData[step.key].outputs.data = listData;
        break;
      case "extract_embeddings":
        // Implement the logic for extracting embeddings
        const url = replacePlaceholders(step.with.url);
        const output = replacePlaceholders(step.with.output);
        console.log(`Extracting embeddings from ${step.with.input_type}`);
        console.log(`URL: ${url}`);
        console.log(`Output: ${output}`);
        if (step.with.input_type == "pdf") {
          const embeddings = await extractEmbeddingsFromPdf(url, output);
        }
        break;
      case "run_prompt_with_embeddings":
        // Implement the logic for running prompt with embeddings
        console.log(`Running prompt with embeddings`);
        console.log(`Prompt: ${step.with.prompt}`);
        console.log(`Embeddings: ${step.with.embeddings}`);
        break;
      case "save_output_data":
        // Implement the logic for saving the output
        console.log(`Saving Output Data: ${step.with.output_key}`);
        console.log(`Item: ${step.with.item}`);
        console.log(`Metadata: ${JSON.stringify(step.with.metadata)}`);
        const item = replacePlaceholders(step.with.item);
        const metadata = replacePlaceholders(step.with.metadata);
        console.log(`Replaced Item: ${item}`);
        console.log(`Replaced Metadata: ${JSON.stringify(metadata)}`);
        await saveOutputData(step.with.output_key, item, metadata);
        stepData[step.key].outputs.data = { item, metadata };
        break;
      default:
        console.log(`Unknown step type: ${step.type}`);
        break;
    }
  }
  return stepData;
}

// Recursive function to replace placeholders with data
function replacePlaceholders(value) {
  const result = replacePlaceholders1(value);
  console.log("replacePlaceholders", allStepData, value, result);
  return result;
}
function replacePlaceholders1(value) {
  if (Array.isArray(value)) {
    return value.map((item) => replacePlaceholders(item));
  }

  // Check if value is an object
  if (typeof value === "object") {
    const newValue = {};
    for (const [key, val] of Object.entries(value)) {
      newValue[key] = replacePlaceholders(val);
    }
    return newValue;
  }

  // Check if value is a placeholder
  if (typeof value === "string") {
    const wholeStringPattern = /^\$\{\{(\s)?(\w+(\.\w+)*)(\s)?\}\}$/g;
    if (value.trim().match(wholeStringPattern)) {
      const path = value.trim().slice(4, -3).split(".").slice(1).join(".");
      const result = get(allStepData, path);
      // console.log("PATH, RESULT", path, result);
      // console.log(typeof result);
      return result !== undefined ? result : value;
    }
    const partialPattern = /\$\{\{(\s)?(\w+(\.\w+)*)(\s)?\}\}/g;
    const result = value.replace(partialPattern, (match, str) => {
      // console.log("MATCH", match);
      // console.log("STR", str);
      const path = match.slice(4, -3).split(".").slice(1).join(".");
      const val = get(allStepData, path);
      // console.log("PATH, VALUE", path, val);
      // console.log(typeof val);
      return val !== undefined ? val : match;
    });

    // console.log("RESULT", result);

    return result;
  }

  return value;
}

// Implement the logic for loading the data
async function loadInputData(inputKey) {
  const dataPath = `inputs/${inputKey}.yml`;

  try {
    const dataContent = fs.readFileSync(dataPath, "utf8");
    const dataData = yaml.load(dataContent);
    if (dataData) {
      console.log(`Loaded data '${inputKey}':`, dataData);
    }

    return dataData;
  } catch (error) {
    console.error(`Error loading data '${inputKey}':`, error);
    return null;
  }
}

// Implement the logic for saving the data
async function saveOutputData(outputKey, item, metadata) {
  const outputDir = "outputs";
  const outputFilePath = `${outputDir}/${outputKey}.yml`;

  try {
    // Create the outputs directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    let listData = {};
    if (fs.existsSync(outputFilePath)) {
      const outputContent = fs.readFileSync(outputFilePath, "utf8");
      listData = yaml.load(outputContent);
    }

    console.log("listData", listData);

    if (!listData) listData = {};

    let path = "";

    // Group data by each metadata field
    for (const [key, value] of Object.entries(metadata)) {
      console.log("key, value", key, value);
      path = path ? `${path}.${value.split(".").join(",")}` : value;
    }

    console.log("path", path);

    set(listData, path, item);

    const updatedContent = yaml.dump(listData);
    fs.writeFileSync(outputFilePath, updatedContent);
    console.log(`Saved item to '${outputFilePath}'`);
  } catch (error) {
    console.error(`Error saving item to '${outputFilePath}':`, error);
  }
}

async function extractEmbeddingsFromPdf(pdfUrl, outputFileName) {
  // pdfUrl =
  //   "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

  // Usage

  console.log("Extracting embeddings from PDF");
  const chunkSize = 10;
  const outputFilePath = `outputs/${outputFileName.replace(
    /[/\\?%*:|"<>]/g,
    "_"
  )}`;

  const data = await fetchPDF(pdfUrl)
    .then((pdfData) => extractTextChunks(pdfData, chunkSize))
    .then((chunks) => storeChunksAsYAML(chunks, outputFilePath))
    .catch((error) => console.error("Error:", error));

  // Embedded in your app, no servers to manage!

  console.log(1);
  // Persist your embeddings, metadata, text, images, video, audio & more
  const db = await lancedb.connect("./data/my_db");
  // const table = await db.openTable("my_table");

  // const table = await db.createTable("my_table", [
  //   { id: 1, vector: [3.1, 4.1], item: "foo", price: 10.0 },
  //   { id: 2, vector: [5.9, 26.5], item: "bar", price: 20.0 },
  // ]);

  // // Production-ready, scalable vector search with optional filters
  // const query = await table
  //   .search([0.1, 0.3, 0.2])
  //   .where("item != 'item foo'")
  //   .limit(2)
  //   .execute();

  // You need to provide an OpenAI API key, here we read it from the OPENAI_API_KEY environment variable
  console.log(2);
  const apiKey = process.env.OPENAI_API_KEY;
  console.log("API KEY", apiKey);
  // The embedding function will create embeddings for the 'context' column
  const embedFunction = new lancedb.OpenAIEmbeddingFunction("context", apiKey);

  const dataAsObject = data.map((item, index) => ({
    // Generate a string ID using Math.random(),
    id: index,
    text: item,
  }));
  const dataWithContext = contextualize(dataAsObject, 6, "text", "context");
  console.log("dataWithContext", dataWithContext.slice(0, 10));
  // Connects to LanceDB
  // const db = await lancedb.connect("data/youtube-lancedb");
  // Wait for 5s
  // await new Promise((resolve) => setTimeout(resolve, 5000));

  let tbl;

  if ((await db.tableNames()).includes("vectors")) {
    tbl = await db.openTable("vectors", embedFunction);
    console.log("Opened table");
  } else {
    console.log("No table found - creating new table");
    tbl = await db.createTable("vectors", dataWithContext, embedFunction);
    console.log("Created table");
  }

  // await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log(3);
  const configuration = new Configuration({ apiKey });
  const openai = new OpenAIApi(configuration);
  // Create readline interface for terminal chat
  const rl = readline.createInterface({ input, output });
  const query = await rl.question("Prompt:");
  console.log(`Searching for ${query}`);
  // wait 5s
  // await new Promise((resolve) => setTimeout(resolve, 5000));
  const results = await tbl
    .search(query)
    .select(["id", "text", "context"])
    .limit(60)
    .execute();

  console.log("RESULTS", results);

  const response = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: createPrompt(query, results),
    max_tokens: 400,
    temperature: 0,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });
  console.log(response.data.choices[0].text);
}

// Creates a prompt by aggregating all relevant contexts
function createPrompt(query, context) {
  let prompt =
    "Answer the question based on the context below.\n\n" + "Context:\n";

  // need to make sure our prompt is not larger than max size
  prompt =
    prompt +
    context
      .map((c) => c.context)
      .join("\n\n---\n\n")
      .substring(0, 3750);
  prompt = prompt + `\n\nQuestion: ${query}\nAnswer:`;
  console.log("prompt", prompt);
  return prompt;
}

// Each chunk has a small text column, we include previous chunks in order to
// have more context information when creating embeddings
function contextualize(rows, contextSize, textColumn, contextColumn) {
  for (let i = 0; i < rows.length; i++) {
    const start = i - contextSize > 0 ? i - contextSize : 0;
    rows[i].context = rows
      .slice(start, i + 1)
      .map((r) => r.text)
      .join(" ");
  }
  return rows;
}

// Function to fetch the PDF from a URL
async function fetchPDF(url) {
  console.log("Fetching PDF...");
  const response = await fetch(url);
  console.log("PDF fetched");
  const buffer = await response.buffer();
  console.log("PDF fetched 2");
  return new Uint8Array(buffer);
}

// Function to extract text from the PDF and break it into chunks
async function extractTextChunks(pdfData, chunkSize) {
  console.log("Extracting text from PDF...");
  console.log("Chunk size:", chunkSize);

  const loadingTask = await pdfjs.getDocument(pdfData);

  const doc = await loadingTask.promise;
  console.log("PDF loaded", doc);
  const numPages = doc.numPages;
  console.log("Number of pages:", numPages);

  let chunks = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    console.log("Page loaded:", pageNum);
    console.log("Extracting text...");
    const content = await page.getTextContent();
    console.log("Text extracted");
    console.log("Number of items:", content.items.length);
    // console.log("Items:", content.items);
    const strings = content.items.map((item) => item.str);

    // Break the text into chunks of desired size
    for (let i = 0; i < strings.length; i += chunkSize) {
      const chunk = strings.slice(i, i + chunkSize).join(" ");
      chunks.push(chunk);
    }
  }

  return chunks;
}

// Function to store chunks in a YAML file
async function storeChunksAsYAML(chunks, filePath) {
  const data = { chunks };
  const yamlString = yaml.dump(data);
  fs.writeFileSync(filePath, yamlString);
  console.log("Chunks stored in YAML file:", filePath);

  return chunks;
}
