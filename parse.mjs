import AdmZip from 'adm-zip';
import axios from 'axios';
import { promises as fs } from 'fs';
import os from 'os';
import { read } from "simple-yaml-import";

const formatConfig = (config, newConfig = []) => {
  if (!config) return newConfig;
  config.forEach((line) => {
    if (line.length > 0) {
      let newConfig_ = formatConfig(line);
      newConfig = [...newConfig, ...newConfig_];
    } else {
      newConfig.push(line);
    }
  });
  return newConfig;
};

const IncExcl = (content, result) => {
  if (content) {
    if (!result) {
      result = [];
    }
    result = [...result, ...content];
  }
  return result;
};

const OS = (content, result, type) => {
  if (content[type]) {
    if (!result[type]) {
      result[type] = {};
    }
    if (content[type]["config"]) {
      if (!result[type]["config"]) {
        result[type]["config"] = [];
      }
      result[type]["config"] = [
        ...result[type]["config"],
        ...content[type]["config"],
      ];
    }

    result[type]["config"] = formatConfig(result[type]["config"]);
    if (content[type].configReplace) {
      Object.entries(content[type].configReplace).forEach(([key, value]) => {
        result[type]["config"][key] = value;
      });
    }

    if (content[type]["drivers"]) {
      let newDrivers = formatConfig(content[type]["drivers"]);
      newDrivers.forEach((drive) => {
        if (!result[type]["drivers"]) {
          result[type]["drivers"] = {};
        }
        if (!result[type]["drivers"][drive.name]) {
          result[type]["drivers"][drive.name] = {};
          result[type]["drivers"][drive.name]["layers"] = [];
        }
        if (drive.strategy === "replace") {
          result[type]["drivers"][drive.name]["layers"] = [...drive["layers"]];
        } else {
          result[type]["drivers"][drive.name]["layers"] = [
            ...result[type]["drivers"][drive.name]["layers"],
            ...drive["layers"],
          ];
        }
      });
    }
  }
  return result[type];
};

const allDisplayTypes = (result, content) => {
  ["local", "gpuStream", "vnc", "console"].forEach((type) => {
    result[type] = OS(content, result ?? {}, type);
  });
  return result;
};

const rec = async (path, result = {}) => {
  let content;
  if (path.slice(0, 1) === "/") {
     content = read("/Users/oleg/projects/kymano-app/repo" + path, {path: '/Users/oleg/projects/kymano-app/repo/'});
    if (content.from) {
      result = await rec(content.from, result);
    }
  } else if (path.split("/")[0] === "github") {
    let githubRepoName = path.split("/").slice(1, 3).join("/");
    let githubFilePath = path.split("/").slice(3).join("/");
    let tmpDir = os.tmpdir();
    console.log('tmpDir:::', tmpDir)
    const body = await axios.get(
      `https://codeload.github.com/${githubRepoName}/zip/refs/heads/master`,
      {
        responseType: "arraybuffer",
      }
    );
    const zip = new AdmZip(body.data);
    try {
      await fs.access(`${tmpDir}/${githubRepoName}`);
    } catch (error) {
      fs.mkdir(`${tmpDir}/${githubRepoName}`, {
        recursive: true,
      });
    }
    zip.extractAllTo(`${tmpDir}/${githubRepoName}`, true);
    content = read(
      `${tmpDir}/${githubRepoName}/repo-master/${githubFilePath}`
    , {path: `${tmpDir}/${githubRepoName}/repo-master/`});
    if (content.from) {
      result = rec(content.from, result);
    }
  }

  ["name", "description", "version"].forEach((param) => {
    result[param] = content[param];
  });

  if (content.requirements) {
    if (!result["requirements"]) {
      result["requirements"] = {};
    }

    ["minimumVersion", "memory", "cores", "disk", "arch"].forEach(
      (requirement) => {
        if (content.requirements[requirement]) {
          result["requirements"][requirement] =
            content.requirements[requirement];
        }
      }
    );
    if (content.requirements.cpu) {
      if (!result["requirements"]["cpu"]) {
        result["requirements"]["cpu"] = {};
      }

      ["brand", "vendor"].forEach((cpuParam) => {
        if (content.requirements.cpu[cpuParam]) {
          if (!result["requirements"]["cpu"][cpuParam]) {
            result["requirements"]["cpu"][cpuParam] = {};
          }

          ["include", "exclude"].forEach((incExcl) => {
            result["requirements"]["cpu"][cpuParam][incExcl] = IncExcl(
              content.requirements.cpu[cpuParam][incExcl],
              result["requirements"]["cpu"][cpuParam][incExcl]
            );
          });
        }
      });
    }
  }

  ["darwin", "linux", "win"].forEach((os) => {
    if (content[os]) {
      if (!result[os]) {
        result[os] = {};
      }
      result[os] = allDisplayTypes(result[os], content[os]);
    }
  });

  return result;
};

const config = await rec("/fedora35Arm64WebDev20/0.1");
//console.log(config);
console.log(JSON.stringify(config, null, 4));