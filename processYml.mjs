import AdmZip from "adm-zip";
import axios from "axios";
import { promises as fs } from "fs";
import os from "os";
import { read } from "simple-yaml-import";

export const processYml = async (ymlPath, workingDir, finalConfig = {}) => {
  let ymlContent;
  if (ymlPath.slice(0, 1) === "/") {
    ymlContent = read(workingDir + ymlPath, { path: workingDir });
    if (ymlContent.from) {
      finalConfig = await processYml(ymlContent.from, workingDir, finalConfig);
    }
  } else if (ymlPath.split("/")[0] === "github") {
    ymlContent = await getFromRemoteZip(ymlPath);
    if (ymlContent.from) {
      finalConfig = processYml(ymlContent.from, finalConfig);
    }
  }

  ["name", "description", "version"].forEach((param) => {
    finalConfig[param] = ymlContent[param];
  });

  if (ymlContent.requirements) {
    finalConfig["requirements"] = addRequirements(
      ymlContent["requirements"],
      finalConfig["requirements"]
    );
  }

  ["darwin", "linux", "win"].forEach((os) => {
    if (ymlContent[os]) {
      finalConfig[os] = addDisplayTypes(ymlContent[os], finalConfig[os]);
    }
  });

  return finalConfig;
};

const formatConfig = (config, formatedConfig = []) => {
  if (!config) return formatedConfig;
  config.forEach((line) => {
    if (line.length > 0) {
      let formatedConfig_ = formatConfig(line);
      formatedConfig = [...formatedConfig, ...formatedConfig_];
    } else {
      formatedConfig.push(line);
    }
  });
  return formatedConfig;
};

const merge = (ymlContent, resultConfig) => {
  if (ymlContent) {
    resultConfig = resultConfig || [];
    resultConfig = [...resultConfig, ...ymlContent];
  }
  return resultConfig;
};

const addDisplayConfig = (ymlContent, resultConfig, type) => {
  if (ymlContent[type]) {
    resultConfig[type] = resultConfig[type] || {};
    if (ymlContent[type]["config"]) {
      resultConfig[type]["config"] = resultConfig[type]["config"] || [];
      resultConfig[type]["config"] = [
        ...resultConfig[type]["config"],
        ...ymlContent[type]["config"],
      ];
    }

    resultConfig[type]["config"] = formatConfig(resultConfig[type]["config"]);
    if (ymlContent[type].configReplace) {
      Object.entries(ymlContent[type].configReplace).forEach(([key, value]) => {
        resultConfig[type]["config"][key] = value;
      });
    }

    if (ymlContent[type]["drivers"]) {
      let newDrivers = formatConfig(ymlContent[type]["drivers"]);
      newDrivers.forEach((drive) => {
        resultConfig[type]["drivers"] = resultConfig[type]["drivers"] || {};
        if (!resultConfig[type]["drivers"][drive.name]) {
          resultConfig[type]["drivers"][drive.name] = {};
          resultConfig[type]["drivers"][drive.name]["layers"] = [];
        }
        if (drive.strategy === "replace") {
          resultConfig[type]["drivers"][drive.name]["layers"] = [
            ...drive["layers"],
          ];
        } else {
          resultConfig[type]["drivers"][drive.name]["layers"] = [
            ...resultConfig[type]["drivers"][drive.name]["layers"],
            ...drive["layers"],
          ];
        }
      });
    }
  }
  return resultConfig[type];
};

const addDisplayTypes = (ymlContent, resultConfig) => {
  resultConfig = resultConfig || {};
  ["local", "gpuStream", "vnc", "console"].forEach((type) => {
    resultConfig[type] = addDisplayConfig(ymlContent, resultConfig ?? {}, type);
  });
  return resultConfig;
};

const getFromRemoteZip = async (ymlPath) => {
  let githubRepoName = ymlPath.split("/").slice(1, 3).join("/");
  let githubYmlPath = ymlPath.split("/").slice(3).join("/");

  let tmpDir = os.tmpdir();
  const zipData = await axios.get(
    `https://codeload.github.com/${githubRepoName}/zip/refs/heads/master`,
    {
      responseType: "arraybuffer",
    }
  );
  const zip = new AdmZip(zipData.data);
  try {
    await fs.access(`${tmpDir}/${githubRepoName}`);
  } catch (error) {
    fs.mkdir(`${tmpDir}/${githubRepoName}`, { recursive: true });
  }
  zip.extractAllTo(`${tmpDir}/${githubRepoName}`, true);
  return read(`${tmpDir}/${githubRepoName}/repo-master/${githubYmlPath}`, {
    path: `${tmpDir}/${githubRepoName}/repo-master/`,
  });
};

const addRequirements = (ymlContent, finalConfig) => {
  finalConfig = finalConfig || {};

  ["minimumVersion", "memory", "cores", "disk", "arch"].forEach(
    (requirement) => {
      if (ymlContent[requirement]) {
        finalConfig[requirement] = ymlContent[requirement];
      }
    }
  );

  if (ymlContent.cpu) {
    finalConfig["cpu"] = finalConfig["cpu"] || {};

    ["brand", "vendor"].forEach((cpuParam) => {
      if (ymlContent.cpu[cpuParam]) {
        finalConfig["cpu"][cpuParam] = finalConfig["cpu"][cpuParam] || {};

        ["include", "exclude"].forEach((incExcl) => {
          finalConfig["cpu"][cpuParam][incExcl] = merge(
            ymlContent.cpu[cpuParam][incExcl],
            finalConfig["cpu"][cpuParam][incExcl]
          );
        });
      }
    });
  }
  return finalConfig;
};

const config = await processYml(
  "/fedora35Arm64WebDev20/0.1",
  "/Users/oleg/projects/kymano-app/repo/"
);
//console.log(config);
console.log(JSON.stringify(config));