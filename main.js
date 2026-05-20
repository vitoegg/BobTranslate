var PROVIDERS = {
  "com.vitoegg.openai.bobtranslate": {
    title: "OpenAI",
    url: "https://api.openai.com/v1/responses",
    defaultModel: "gpt-5.4-nano",
    models: {
      "gpt-5.4-nano": true,
      "gpt-5.4-mini": true
    },
    request: requestOpenAI,
    streamRequest: streamOpenAI
  },
  "com.vitoegg.fireworks.bobtranslate": {
    title: "Fireworks",
    url: "https://api.fireworks.ai/inference/v1/responses",
    defaultModel: "accounts/fireworks/models/qwen3p6-plus",
    models: {
      "accounts/fireworks/models/qwen3p6-plus": true,
      "accounts/fireworks/models/kimi-k2p6": true
    },
    request: requestFireworks,
    streamRequest: streamFireworks
  }
};

var PROVIDER = PROVIDERS[pluginIdentifier()] || PROVIDERS["com.vitoegg.openai.bobtranslate"];

var LANGUAGES = {
  auto: "Auto",
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  ru: "Russian",
  ar: "Arabic",
  tr: "Turkish"
};

function supportLanguages() {
  return [
    "auto",
    "zh-Hans",
    "zh-Hant",
    "en",
    "ja",
    "ko",
    "fr",
    "de",
    "es",
    "ru",
    "ar",
    "tr"
  ];
}

function pluginTimeoutInterval() {
  return 120;
}

function translate(query, completion) {
  var config = readConfig();
  var error = validateConfig(config);
  if (error) {
    complete(query, completion, { error: error });
    return;
  }

  var prompt = buildPrompt(query);
  PROVIDER.streamRequest(config, prompt.system, prompt.user, query, function(result) {
    if (result.error) {
      complete(query, completion, { error: result.error });
      return;
    }

    var text = cleanOutput(result.text);
    if (!text) {
      complete(query, completion, {
        error: makeError("notFound", "没有获取到翻译结果", result.raw)
      });
      return;
    }

    complete(query, completion, {
      result: {
        from: normalizeLang(query.detectFrom || query.from),
        to: normalizeLang(query.detectTo || query.to),
        toParagraphs: splitParagraphs(text),
        raw: result.raw
      }
    });
  });
}

function pluginValidate(completion) {
  var config = readConfig();
  var error = validateConfig(config);
  if (error) {
    completion({ error: error });
    return;
  }
  config.maxTokens = 16;
  config.temperature = 0;

  PROVIDER.request(
    config,
    "You are a connection checker. Reply with exactly OK.",
    "Reply with exactly OK.",
    null,
    function(result) {
      if (result.error) {
        completion({ error: result.error });
        return;
      }
      completion({ result: !!cleanOutput(result.text) });
    }
  );
}

function readConfig() {
  var selectedModel = stringOption("model", PROVIDER.defaultModel);

  return {
    apiKey: stringOption("apiKey", ""),
    model: resolveModel(selectedModel),
    reasoningEffort: stringOption("reasoningEffort", "none"),
    maxTokens: numberOption("maxTokens", 1024),
    temperature: numberOption("temperature", 0)
  };
}

function validateConfig(config) {
  if (!config.apiKey) {
    return makeError("secretKey", "请填写 " + PROVIDER.title + " API Key", null);
  }
  if (!config.model) {
    return makeError("param", "请填写自定义模型名称", null);
  }
  return null;
}

function resolveModel(selectedModel) {
  if (selectedModel === "custom") {
    return stringOption("customModel", "");
  }

  if (PROVIDER.models[selectedModel]) {
    return selectedModel;
  }

  return PROVIDER.defaultModel;
}

function buildPrompt(query) {
  var fromCode = normalizeLang(query.detectFrom || query.from);
  var toCode = normalizeLang(query.detectTo || query.to);
  var fromLang = langName(fromCode);
  var toLang = langName(toCode);
  var text = query.text || "";

  return {
    system: "You are a professional translator. Translate accurately and naturally. Return only the translation, without explanations, quotes, labels, or markdown.",
    user: "Translate the following text from " + fromLang + " to " + toLang + ":\n\n" + text
  };
}

function requestOpenAI(config, systemPrompt, userPrompt, cancelSignal, callback) {
  var body = responsesBody(config, systemPrompt, userPrompt);

  sendRequest(PROVIDER.url, config.apiKey, body, cancelSignal, function(resp) {
    var error = responseError(resp);
    if (error) {
      callback({ error: error });
      return;
    }

    var data = resp.data || {};
    callback({
      text: extractOpenAIText(data),
      raw: data
    });
  });
}

function requestFireworks(config, systemPrompt, userPrompt, cancelSignal, callback) {
  var body = responsesBody(config, systemPrompt, userPrompt);
  body.store = false;

  sendRequest(PROVIDER.url, config.apiKey, body, cancelSignal, function(resp) {
    var error = responseError(resp);
    if (error) {
      callback({ error: error });
      return;
    }

    var data = resp.data || {};
    callback({
      text: extractOpenAIText(data),
      raw: data
    });
  });
}

function streamOpenAI(config, systemPrompt, userPrompt, query, callback) {
  streamResponses(PROVIDER.url, config, systemPrompt, userPrompt, query, false, callback);
}

function streamFireworks(config, systemPrompt, userPrompt, query, callback) {
  streamResponses(PROVIDER.url, config, systemPrompt, userPrompt, query, true, callback);
}

function responsesBody(config, systemPrompt, userPrompt) {
  return {
    model: config.model,
    instructions: systemPrompt,
    input: userPrompt,
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: config.maxTokens,
    temperature: config.temperature
  };
}

function sendRequest(url, apiKey, body, cancelSignal, handler) {
  var request = {
    method: "POST",
    url: url,
    header: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey
    },
    body: body,
    timeout: 120,
    handler: handler
  };

  if (cancelSignal) {
    request.cancelSignal = cancelSignal;
  }

  $http.request(request);
}

function streamResponses(url, config, systemPrompt, userPrompt, query, disableStore, callback) {
  var body = responsesBody(config, systemPrompt, userPrompt);
  var state = {
    buffer: "",
    text: "",
    raw: null,
    error: null
  };
  body.stream = true;
  if (disableStore) {
    body.store = false;
  }

  sendStreamRequest(url, config.apiKey, body, query.cancelSignal, function(stream) {
    parseSSE(state, stream.text || "", function(event) {
      handleStreamEvent(query, state, event);
    });
  }, function(resp) {
    parseSSE(state, "", function(event) {
      handleStreamEvent(query, state, event);
    });

    var error = responseError(resp);
    if (error) {
      callback({ error: error });
      return;
    }
    if (state.error) {
      callback({ error: state.error });
      return;
    }

    callback({
      text: state.text,
      raw: state.raw
    });
  });
}

function sendStreamRequest(url, apiKey, body, cancelSignal, streamHandler, handler) {
  var request = {
    method: "POST",
    url: url,
    header: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey
    },
    body: body,
    timeout: 120,
    streamHandler: streamHandler,
    handler: handler
  };

  if (cancelSignal) {
    request.cancelSignal = cancelSignal;
  }

  $http.streamRequest(request);
}

function responseError(resp) {
  if (!resp) {
    return makeError("network", "请求失败", null);
  }

  if (resp.error) {
    return makeError("network", resp.error.message || resp.error.localizedDescription || "网络请求失败", resp.error);
  }

  var statusCode = resp.response ? resp.response.statusCode : 0;
  if (statusCode < 200 || statusCode >= 300) {
    return makeError("api", errorMessage(resp.data) || "接口返回异常：" + statusCode, resp.data);
  }

  return null;
}

function extractOpenAIText(data) {
  if (!data) {
    return "";
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (!data.output || !data.output.length) {
    return "";
  }

  var parts = [];
  for (var i = 0; i < data.output.length; i++) {
    var item = data.output[i];
    if (!item || !item.content) {
      continue;
    }
    if (item.role && item.role !== "assistant") {
      continue;
    }
    for (var j = 0; j < item.content.length; j++) {
      var content = item.content[j];
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n");
}

function complete(query, completion, payload) {
  if (query && typeof query.onCompletion === "function") {
    query.onCompletion(payload);
  } else if (typeof completion === "function") {
    completion(payload);
  }
}

function streamComplete(query, text) {
  if (!query || typeof query.onStream !== "function") {
    return;
  }
  var cleanText = cleanOutput(text);
  if (!cleanText) {
    return;
  }
  query.onStream({
    result: {
      from: normalizeLang(query.detectFrom || query.from),
      to: normalizeLang(query.detectTo || query.to),
      toParagraphs: splitParagraphs(cleanText)
    }
  });
}

function handleStreamEvent(query, state, event) {
  state.raw = event;
  var error = streamEventError(event);
  if (error) {
    state.error = error;
    return;
  }

  var delta = extractStreamDelta(event);
  if (!delta) {
    return;
  }
  state.text += delta;
  streamComplete(query, state.text);
}

function parseSSE(state, text, onEvent) {
  state.buffer += text;

  var chunks = state.buffer.split(/\r?\n\r?\n/);
  state.buffer = chunks.pop();
  for (var i = 0; i < chunks.length; i++) {
    parseSSEChunk(chunks[i], onEvent);
  }

  if (!text && trim(state.buffer)) {
    parseSSEChunk(state.buffer, onEvent);
    state.buffer = "";
  }
}

function parseSSEChunk(chunk, onEvent) {
  var lines = chunk.split(/\r?\n/);
  var dataLines = [];

  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf("data:") === 0) {
      dataLines.push(lines[i].slice(5).replace(/^\s/, ""));
    }
  }

  if (!dataLines.length) {
    return;
  }

  var data = dataLines.join("\n");
  if (data === "[DONE]") {
    return;
  }

  try {
    onEvent(JSON.parse(data));
  } catch (_) {}
}

function extractStreamDelta(event) {
  if (!event) {
    return "";
  }
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
    return event.delta;
  }
  if (event.delta && typeof event.delta === "string") {
    return event.delta;
  }
  if (event.choices && event.choices.length) {
    var delta = event.choices[0].delta || {};
    if (typeof delta.content === "string") {
      return delta.content;
    }
  }
  return "";
}

function streamEventError(event) {
  if (!event) {
    return null;
  }
  if (event.type === "error" || event.error) {
    var error = event.error || event;
    return makeError("api", errorMessage(error) || "接口返回异常", error);
  }
  if (event.type === "response.failed" && event.response && event.response.error) {
    return makeError("api", errorMessage(event.response.error) || "接口返回异常", event.response.error);
  }
  return null;
}

function splitParagraphs(text) {
  var paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  var result = [];
  for (var i = 0; i < paragraphs.length; i++) {
    var paragraph = trim(paragraphs[i]);
    if (paragraph) {
      result.push(paragraph);
    }
  }
  return result.length ? result : [text];
}

function cleanOutput(text) {
  text = trim(text || "");
  text = text.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "");
  return trim(text);
}

function langName(code) {
  return LANGUAGES[code] || code || "Auto";
}

function normalizeLang(code) {
  return code && code !== "auto" ? code : "auto";
}

function pluginIdentifier() {
  if (typeof $info !== "undefined" && $info && $info.identifier) {
    return $info.identifier;
  }
  return "";
}

function stringOption(key, fallback) {
  var value = $option[key];
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return String(value);
}

function numberOption(key, fallback) {
  var value = Number(stringOption(key, String(fallback)));
  return isNaN(value) ? fallback : value;
}

function errorMessage(data) {
  if (!data) {
    return "";
  }
  if (typeof data === "string") {
    return data;
  }
  if (data.error && data.error.message) {
    return data.error.message;
  }
  if (data.message) {
    return data.message;
  }
  return "";
}

function makeError(type, message, addition) {
  return {
    type: type,
    message: message,
    addition: addition || {}
  };
}

function trim(value) {
  return String(value).replace(/^\s+|\s+$/g, "");
}
