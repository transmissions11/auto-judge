import { useState } from "react";

import {
  useToast,
  Heading,
  Text,
  Button,
  FormControl,
  FormLabel,
  Input,
  Textarea,
} from "@chakra-ui/react";
import { OpenAI } from "openai-streams";
import { yieldStream } from "yield-stream";

import SimpleCrypto from "simple-crypto-js";

import { Column } from "../utils/chakra";
import { ENCRYPTED_API_KEY, SYSTEM_PROMPT, TOAST_CONFIG } from "../utils/constants";
import { CreateChatCompletionStreamResponseChoicesInner } from "../utils/types";
import { transcribeAudio } from "../utils/whisper";

const API_KEY = (() => {
  try {
    return new SimpleCrypto(prompt("What's the password?"))
      .decrypt(ENCRYPTED_API_KEY)
      .toString();
  } catch {
    alert("The password you entered is incorrect! Reload and enter the correct one.");
    return null;
  }
})();

function App() {
  const toast = useToast();

  const judge = async (transcription: string) => {
    setIsJudgingLoading(true);

    (async () => {
      const stream = await OpenAI(
        "chat",
        {
          model: "gpt-4-32k-0613",
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            { role: "user", content: "Judge this round:\n" + transcription },
          ],
        },
        { apiKey: API_KEY!, mode: "raw" }
      );

      const DECODER = new TextDecoder();

      for await (const chunk of yieldStream(stream)) {
        try {
          const decoded = JSON.parse(DECODER.decode(chunk));

          if (decoded.choices === undefined)
            throw new Error(
              "No choices in response. Decoded response: " + JSON.stringify(decoded)
            );

          const choice: CreateChatCompletionStreamResponseChoicesInner =
            decoded.choices[0];

          if (choice.index === undefined)
            throw new Error(
              "No index in choice. Decoded choice: " + JSON.stringify(choice)
            );

          // The ChatGPT API will start by returning a
          // choice with only a role delta and no content.
          if (choice.delta?.content) {
            setJudgingResult((r) => (r ?? "") + (choice.delta?.content ?? "[UNKNOWN]"));
          }

          // If the choice has a finish reason, then it's the final
          // choice and we can mark it as no longer loading right now.
          if (choice.finish_reason !== null) setIsJudgingLoading(false);
        } catch (err) {
          console.error(err);
        }
      }

      setIsJudgingLoading(false);
    })().catch((err) =>
      toast({
        title: err.toString(),
        status: "error",
        ...TOAST_CONFIG,
      })
    );
  };

  const [isUploadLoading, setIsUploadLoading] = useState(false);
  const [isJudgingLoading, setIsJudgingLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);

  const [transcription, setTranscription] = useState<string | null>(null);
  const [judgingResult, setJudgingResult] = useState<string | null>(null);

  const onUpload = async () => {
    if (file) {
      setFile(null);
      setTranscription(null);
      setJudgingResult(null);
      setIsUploadLoading(true);

      try {
        setTranscription(await transcribeAudio(file, API_KEY!));
      } catch (error: any) {
        toast({
          title: error.toString(),
          status: "error",
          ...TOAST_CONFIG,
        });
      }

      setIsUploadLoading(false);
    } else {
      toast({
        title: "Select a file first!",
        status: "warning",
        ...TOAST_CONFIG,
      });
    }
  };

  return (
    <>
      <Column
        mainAxisAlignment="flex-start"
        crossAxisAlignment="center"
        width="100%"
        p={8}
      >
        {API_KEY ? (
          <>
            <Heading>Auto-Judge</Heading>
            <Text mt={2}>A half decent parli judge at your fingertips!</Text>

            <FormControl mt={4}>
              <FormLabel>Upload audio file</FormLabel>
              <Input
                type="file"
                accept="audio/*"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const uploadedFile = event.target.files && event.target.files[0];
                  if (uploadedFile) setFile(uploadedFile);
                }}
              />
            </FormControl>

            <Button my={4} onClick={onUpload} isLoading={isUploadLoading}>
              Upload (this can take up to ~10 minutes for long rounds)
            </Button>

            {transcription && (
              <>
                Transcription:
                <Textarea
                  value={transcription}
                  isReadOnly
                  placeholder="Transcription will appear here..."
                />
                <Button
                  my={4}
                  onClick={() => {
                    setJudgingResult(null);
                    judge(transcription);
                  }}
                  isLoading={isJudgingLoading}
                >
                  Judge
                </Button>
              </>
            )}

            {judgingResult && (
              <>
                Deliberation & Verdict:
                <Textarea
                  minHeight="1000px"
                  value={judgingResult}
                  isReadOnly
                  placeholder="Judging result will appear here..."
                />
              </>
            )}
          </>
        ) : (
          "The password you entered is incorrect! Reload and enter the correct one."
        )}
      </Column>
    </>
  );
}

export default App;
