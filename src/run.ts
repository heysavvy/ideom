import * as fs from "fs";
import * as yaml from "js-yaml";
import fetch from "node-fetch";
import * as pdfjs from "pdfjs-dist";
import { get, set } from "lodash";
// import * as lancedb from "vectordb";
import { Configuration, OpenAIApi } from "openai";
import { createClient } from "@supabase/supabase-js";

// import { OpenAIEmbeddings } from "langchain/embeddings/openai";

import * as dotenv from "dotenv";
import { stdin as input, stdout as output } from "process";

type Step = {
  name: string;
  key: string;
  type: string;
  with: {
    [key: string]: any;
  };
  steps: Step[];
};

dotenv.config();

// // Process the main steps
// processSteps(config.processes.get_manifesto_pledges.steps).then((stepData) => {
//   console.log("stepData:\n", JSON.stringify(stepData, null, 2));
// });

let allStepData: any = {
  steps: {},
};

export default function run({
  process_key,
  steps,
}: {
  process_key: string | null;
  steps: Step[] | null;
}) {
  console.log("steps:\n", JSON.stringify(steps, null, 2));
  const stepsToRun: Step[] = (steps ||
    getProcessSteps(process_key || "get_manifesto_pledges")) as Step[];

  console.log("stepsToRun:\n", JSON.stringify(stepsToRun, null, 2));

  allStepData = {
    steps: {},
  };

  return processSteps(stepsToRun);
}

function getProcessSteps(processKey: string) {
  // Load the YAML file
  const filePath = `processes/${processKey}.yml`;
  console.log(`Loading process steps from ${filePath}`);
  const yamlContent = fs.readFileSync(filePath, "utf8");

  // Parse the YAML into a JavaScript object
  const config: any = yaml.load(yamlContent);

  console.log("typeof config", typeof config);

  console.log("config:\n", JSON.stringify(config, null, 2));

  const steps = config.processes[processKey].steps;

  console.log("steps:\n", JSON.stringify(steps, null, 2));

  return steps;
}

// Process the steps
async function processSteps(steps: Step[], localStepData?: any) {
  console.log("localStepData", localStepData);
  const stepData = localStepData || allStepData;
  console.log("stepData", stepData);
  console.log("stepData.steps", stepData.steps);

  for (const step of steps) {
    // Wait 1s
    // await new Promise((resolve) => setTimeout(resolve, 500));
    stepData.steps[step.key] = {
      outputs: {},
    };
    switch (step.type) {
      case "loop": {
        const items = replacePlaceholders(step.with.items);
        console.log(`Looping over items: ${items}`, typeof items);
        stepData.steps[step.key].inputs = items;
        stepData.steps[step.key].items = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          console.log(`Loop - item: ${item}`);
          stepData.steps[step.key].current_step = { item, steps: {} };
          allStepData.current_loop_iteration =
            stepData.steps[step.key].current_step;
          const innerSteps = await processSteps(
            step.steps,
            stepData.steps[step.key].current_step
          );
          stepData.steps[step.key].items.push({ item, steps: innerSteps });
        }
        // delete stepData.steps[step.key].current_step;
        break;
      }
      case "load_input_data": {
        console.log(`Loading input data: ${step.with.input_key}`);
        const listData = await loadInputData(step.with.input_key);
        stepData.steps[step.key].outputs.data = listData;
        break;
      }
      case "extract_embeddings": {
        // Implement the logic for extracting embeddings
        const url = replacePlaceholders(step.with.url);
        const wordsPerChunk = replacePlaceholders(step.with.words_per_chunk);
        const chunkOverlapPercent = replacePlaceholders(
          step.with.chunk_overlap_percent
        );
        const outputKey = replacePlaceholders(step.with.output_key);
        console.log(`Extracting embeddings from ${step.with.input_type}`);
        console.log(`URL: ${url}`);
        console.log(`Output: ${output}`);
        if (step.with.input_type == "pdf") {
          const { data } = await extractEmbeddingsFromPdf(
            url,
            wordsPerChunk,
            chunkOverlapPercent,
            outputKey
          );
          stepData.steps[step.key].outputs.documents = data;
        }
        break;
      }
      case "extract_embeddings_to_file": {
        // Implement the logic for extracting embeddings
        const url = replacePlaceholders(step.with.url);
        const wordsPerChunk = replacePlaceholders(step.with.words_per_chunk);
        const chunkOverlapPercent = replacePlaceholders(
          step.with.chunk_overlap_percent
        );
        const output = replacePlaceholders(step.with.output);
        console.log(`Extracting embeddings from ${step.with.input_type}`);
        console.log(`URL: ${url}`);
        console.log(`Output: ${output}`);
        if (step.with.input_type == "pdf") {
          const embeddings = await extractEmbeddingsFromPdf(
            url,
            wordsPerChunk,
            chunkOverlapPercent,
            undefined,
            output
          );
        }
        break;
      }
      case "run_prompt_with_embeddings": {
        // Implement the logic for running prompt with embeddings
        console.log(`Running prompt with embeddings`);
        console.log(`Prompt: ${step.with.prompt}`);
        console.log(`Embeddings: ${step.with.embeddings}`);
        break;
      }
      case "save_to_vector_db": {
        // Implement the logic for saving to vector db
        console.log(`Saving to vector db`);
        console.log(`Embeddings: ${step.with.documents}`);
        console.log(`Metadata: ${step.with.metadata}`);
        const documents = replacePlaceholders(step.with.documents);
        const tableName = replacePlaceholders(step.with.table_name);
        const metadata = replacePlaceholders(step.with.metadata);
        const source = replacePlaceholders(step.with.source);

        console.log(allStepData.current_loop_iteration.steps);

        console.log(`Documents: ${JSON.stringify(documents).slice(0, 1000)}`);

        saveToVectorDatabase(documents, tableName, metadata, source);
        break;
      }
      case "save_output_data": {
        // Implement the logic for saving the output
        console.log(`Saving Output Data: ${step.with.output_key}`);
        console.log(`Item: ${step.with.item}`);
        console.log(`Metadata: ${JSON.stringify(step.with.metadata)}`);
        const item = replacePlaceholders(step.with.item);
        const metadata = replacePlaceholders(step.with.metadata);
        console.log(`Replaced Item: ${item}`);
        console.log(`Replaced Metadata: ${JSON.stringify(metadata)}`);
        await saveOutputData(step.with.output_key, item, metadata);
        stepData.steps[step.key].outputs.data = { item, metadata };
        break;
      }
      default: {
        console.log(`Unknown step type: ${step.type}`);
        break;
      }
    }
  }
  return stepData;
}

// Recursive function to replace placeholders with data
function replacePlaceholders<T>(value: T): T {
  const result = replacePlaceholders1(value);
  // console.log("replacePlaceholders", allStepData, value, result);
  return result;
}
function replacePlaceholders1<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => replacePlaceholders(item)) as T;
  }

  // Check if value is an object
  if (typeof value === "object") {
    const newValue = {};
    for (const [key, val] of Object.entries(value as any)) {
      (newValue as any)[key] = replacePlaceholders(val);
    }
    return newValue as T;
  }

  // Check if value is a placeholder
  if (typeof value === "string") {
    const wholeStringPattern = /^\$\{\{(\s)?(\w+(\.\w+)*)(\s)?\}\}$/g;
    if (value.trim().match(wholeStringPattern)) {
      console.log("WHOLE STRING", value);
      const path = value.trim().slice(4, -3);
      console.log("PATH", path);
      const result = get(allStepData, path);
      // console.log("PATH, RESULT", path, result);
      // console.log(typeof result);
      return result !== undefined ? result : value;
    }
    const partialPattern = /\$\{\{(\s)?(\w+(\.\w+)*)(\s)?\}\}/g;
    const result = value.replace(partialPattern, (match, str) => {
      // console.log("MATCH", match);
      // console.log("STR", str);
      const path = match.slice(4, -3);
      const val = get(allStepData, path);
      // console.log("PATH, VALUE", path, val);
      // console.log(typeof val);
      return val !== undefined ? val : match;
    });

    // console.log("RESULT", result);

    return result as T;
  }

  return value;
}

// Implement the logic for loading the data
async function loadInputData(inputKey: string) {
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
async function saveOutputData(
  outputKey: string,
  item: any,
  metadata: { [key: string]: any }
) {
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
      listData = yaml.load(outputContent) as any;
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

async function extractEmbeddingsFromPdf(
  pdfUrl: string,
  wordsPerChunk?: number,
  chunkOverlapPercent?: number,
  outputKey?: string,
  outputFileName?: string
) {
  // pdfUrl =
  //   "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

  // Usage

  console.log("Extracting embeddings from PDF");
  const chunkSize = wordsPerChunk || 100;
  if (!chunkOverlapPercent) chunkOverlapPercent = 50;

  console.log("Words per chunk:", chunkSize);
  console.log("Chunk overlap percent:", chunkOverlapPercent);

  if (!outputFileName) outputFileName = outputKey + ".yml";
  const outputFilePath = `outputs/${outputFileName.replace(
    /[/\\?%*:|"<>]/g,
    "_"
  )}`;

  const data: string[] = await fetchPDF(pdfUrl).then((pdfData) =>
    extractTextChunks(pdfData, chunkSize, chunkOverlapPercent as number)
  );
  // .then((chunks) => storeChunksAsYAML(chunks, outputFilePath))
  // .catch((error) => console.error("Error:", error));

  // Embedded in your app, no servers to manage!

  return {
    data,
    output_file_name: outputFileName,
  };
}

async function saveToVectorDatabase(
  documents: string[],
  tableName: string,
  metadata: { [key: string]: any },
  source: {
    url: string;
    type: string;
  }
) {
  const apiKey = process.env.OPENAI_API_KEY as string;
  const configuration = new Configuration({ apiKey });
  const openai = new OpenAIApi(configuration);

  const supabaseClient = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_KEY ?? "",
    {
      auth: {
        persistSession: false,
      },
    }
  );

  console.log(`Saving ${documents.length} documents to database`);

  for (const document of documents.slice(0, 20)) {
    console.log(document);
    console.log("-");
    console.log("-----");
    console.log("-");

    // // OpenAI recommends replacing newlines with spaces for best results
    // const input = document.replace(/\n/g, " ").trim();
    // const embeddingResponse = await openai.createEmbedding({
    //   model: "text-embedding-ada-002",
    //   input,
    // });
    // const [{ embedding }] = embeddingResponse.data.data;
    // // In production we should handle possible errors
    // const { data, error } = await supabaseClient
    //   .from(tableName)
    //   .insert({
    //     content: document,
    //     embedding,
    //     metadata,
    //     source_url: source.url,
    //     source_type: source.type,
    //   })
    //   .select("id, content");
    // if (error) {
    //   console.error("Error saving to database:", error);
    // } else {
    //   console.log("Saved to database:", data);
    // }
  }
}
// async function saveToLocalVectorDatabase(
//   chunks: string[],
//   tableName: string,
//   metadata: { [key: string]: any }
// ) {
//   console.log(1);
//   // Persist your embeddings, metadata, text, images, video, audio & more
//   const db = await lancedb.connect(`./data/my_db/${tableName}`);
//   // const table = await db.openTable("my_table");

//   // const table = await db.createTable("my_table", [
//   //   { id: 1, vector: [3.1, 4.1], item: "foo", price: 10.0 },
//   //   { id: 2, vector: [5.9, 26.5], item: "bar", price: 20.0 },
//   // ]);

//   // // Production-ready, scalable vector search with optional filters
//   // const query = await table
//   //   .search([0.1, 0.3, 0.2])
//   //   .where("item != 'item foo'")
//   //   .limit(2)
//   //   .execute();

//   // You need to provide an OpenAI API key, here we read it from the OPENAI_API_KEY environment variable
//   console.log(2);
//   const apiKey = process.env.OPENAI_API_KEY as string;
//   console.log("API KEY", apiKey);
//   // The embedding function will create embeddings for the 'context' column
//   const embedFunction = new lancedb.OpenAIEmbeddingFunction("context", apiKey);

//   const dataAsObject = chunks.map((item: any, index: number) => ({
//     // Generate a string ID using Math.random(),
//     id: index,
//     text: item,
//     metadata,
//   }));
//   const dataWithContext = contextualize(dataAsObject, 6);
//   console.log("dataWithContext", dataWithContext.slice(0, 10));
//   // Connects to LanceDB
//   // const db = await lancedb.connect("data/youtube-lancedb");
//   // Wait for 5s
//   // await new Promise((resolve) => setTimeout(resolve, 5000));

//   let tbl;

//   if ((await db.tableNames()).includes("vectors")) {
//     tbl = await db.openTable("vectors", embedFunction);
//     console.log("Opened table");
//   } else {
//     console.log("No table found - creating new table");
//     tbl = await db.createTable("vectors", dataWithContext, embedFunction);
//     console.log("Created table");
//   }

//   // await new Promise((resolve) => setTimeout(resolve, 5000));

//   console.log(3);
//   const configuration = new Configuration({ apiKey });
//   const openai = new OpenAIApi(configuration);
//   // Create readline interface for terminal chat
//   // const rl = readline.createInterface({ input, output });
//   // const query = await rl.question("Prompt:");
//   const query =
//     "What education policies does this party have? Please answer in bullet points.";
//   console.log(`Searching for ${query}`);
//   // wait 5s
//   // await new Promise((resolve) => setTimeout(resolve, 5000));
//   const results = await tbl
//     .search(query)
//     .select(["id", "text", "context"])
//     .limit(60)
//     .execute();

//   console.log("RESULTS", results);

//   const response = await openai.createCompletion({
//     model: "text-davinci-003",
//     prompt: createPrompt(query, results),
//     max_tokens: 400,
//     temperature: 0,
//     top_p: 1,
//     frequency_penalty: 0,
//     presence_penalty: 0,
//   });
//   console.log(response.data.choices[0].text);
// }

// Creates a prompt by aggregating all relevant contexts
function createPrompt(query: string, context: any) {
  let prompt =
    "Answer the question based on the context below.\n\n" + "Context:\n";

  // need to make sure our prompt is not larger than max size
  prompt =
    prompt +
    context
      .map((c: any) => c.context)
      .join("\n\n---\n\n")
      .substring(0, 3750);
  prompt = prompt + `\n\nQuestion: ${query}\nAnswer:`;
  console.log("prompt", prompt);
  return prompt;
}

// Each chunk has a small text column, we include previous chunks in order to
// have more context information when creating embeddings
function contextualize(rows: any[], contextSize: number) {
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
async function fetchPDF(url: string) {
  console.log("Fetching PDF...", url);
  const response = await fetch(url);
  console.log("PDF fetched");
  const buffer = await response.buffer();
  console.log("PDF fetched 2");
  return new Uint8Array(buffer);
}

// Function to extract text from the PDF and break it into chunks
async function extractTextChunks(
  pdfData: any,
  chunkSize: number,
  chunkOverlapPercent: number
): Promise<string[]> {
  console.log("Extracting text from PDF...");
  console.log("Chunk size:", chunkSize);

  const loadingTask = await pdfjs.getDocument(pdfData);

  const doc = await loadingTask.promise;
  console.log("PDF loaded");
  const numPages = doc.numPages;
  console.log("Number of pages:", numPages);

  let chunks = [];

  const chunkIncrement = Math.round(
    chunkSize * (1 - chunkOverlapPercent / 100)
  );
  console.log("Chunk increment in words", chunkIncrement);

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    // console.log("Page loaded:", pageNum);
    // console.log("Extracting text...");
    const content = await page.getTextContent();
    // console.log("Text extracted");
    // console.log("Number of items:", content.items.length);
    // console.log("Items:", content.items);
    const strings = content.items.map((item) => (item as any).str as string);

    const pageTextByWord = strings.join(" ").split(" ");

    // Break the text into chunks of desired size
    for (let i = 0; i < pageTextByWord.length; i += chunkIncrement) {
      const chunk = pageTextByWord.slice(i, i + chunkSize).join(" ");
      chunks.push(chunk);
    }
  }

  return chunks;
}

// Function to store chunks in a YAML file
async function storeChunksAsYAML(chunks: any, filePath: string) {
  const data = { chunks };
  const yamlString = yaml.dump(data);
  fs.writeFileSync(filePath, yamlString);
  console.log("Chunks stored in YAML file:", filePath);

  return chunks;
}
