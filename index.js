const fs = require("fs");
const yaml = require("js-yaml");
const { set } = require("lodash");
const get = require("lodash/get");

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
