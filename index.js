const fs = require("fs");
const yaml = require("js-yaml");
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
    stepData[step.key] = {
      outputs: {},
    };
    switch (step.type) {
      case "loop":
        const items = replacePlaceholders(step.with.items);
        console.log(`Looping over items: ${items}`);
        stepData[step.key].items = [];
        for (const item of items) {
          const innerSteps = await processSteps(step.steps);
          stepData[step.key].items.push(innerSteps);
        }
        break;
      case "load_input_data":
        console.log(`Loading input data: ${step.with.input_key}`);
        const listData = await loadInputData(step.with.input_key);
        stepData[step.key].outputs.data = listData;
        break;
      case "extract_embeddings":
        // Implement the logic for extracting embeddings
        console.log(`Extracting embeddings from ${step.with.input_type}`);
        console.log(`URL: ${step.with.url}`);
        console.log(`Output: ${step.with.output}`);
        break;
      case "run_prompt_with_embeddings":
        // Implement the logic for running prompt with embeddings
        console.log(`Running prompt with embeddings`);
        console.log(`Prompt: ${step.with.prompt}`);
        console.log(`Embeddings: ${step.with.embeddings}`);
        break;
      case "save_list":
        // Implement the logic for saving the list
        console.log(`Saving list: ${step.with.list}`);
        console.log(`Item: ${step.with.item}`);
        console.log(`Metadata: ${JSON.stringify(step.with.metadata)}`);
        const item = step.with.item;
        const metadata = step.with.metadata;
        await saveOutputData(step.with.list, item, metadata);
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
  console.log("replacePlaceholders", value, allStepData);
  // Check if value is a placeholder
  if (value.startsWith("${{") && value.endsWith("}}")) {
    const key = value.slice(4, -3).split(".").slice(1).join(".");
    const data = get(allStepData, key);
    console.log("key, data", key, data);
    return data;
  }
  return value;
}

// Implement the logic for loading the list
async function loadInputData(inputKey) {
  const dataPath = `inputs/${inputKey}.yml`;

  try {
    const dataContent = fs.readFileSync(dataPath, "utf8");
    const dataData = yaml.load(dataContent);
    if (dataData) {
      console.log(`Loaded list '${inputKey}':`, dataData);
    }

    return dataData;
  } catch (error) {
    console.error(`Error loading data '${inputKey}':`, error);
    return null;
  }
}

// Implement the logic for saving the list
async function saveOutputData(listName, item, metadata) {
  const outputDir = "outputs";
  const outputFilePath = `${outputDir}/${listName}.yaml`;

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

    // Group data by each metadata field
    for (const [key, value] of Object.entries(metadata)) {
      if (!listData[key]) {
        listData[key] = [];
      }

      const newItem = {
        item,
        metadata: { ...metadata },
      };
      listData[key].push(newItem);
    }

    const updatedContent = yaml.dump(listData);
    fs.writeFileSync(outputFilePath, updatedContent);
    console.log(`Saved item to '${outputFilePath}'`);
  } catch (error) {
    console.error(`Error saving item to '${outputFilePath}':`, error);
  }
}
