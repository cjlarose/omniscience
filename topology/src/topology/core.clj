(ns topology.core
  (:require topology.github-event-timestamp-extractor)
  (:import [org.apache.kafka.streams.kstream KStreamBuilder ValueMapper]
           [org.apache.kafka.streams KafkaStreams StreamsConfig]
           [org.apache.kafka.common.serialization Serdes]
           [topology.github-event-timestamp-extractor GithubEventTimestampExtractor])
  (:gen-class))

(def props
  {StreamsConfig/APPLICATION_ID_CONFIG,    "omniscience"
   StreamsConfig/BOOTSTRAP_SERVERS_CONFIG, "kafka:9092"
   StreamsConfig/KEY_SERDE_CLASS_CONFIG,   (.getName (.getClass (Serdes/String)))
   StreamsConfig/VALUE_SERDE_CLASS_CONFIG, (.getName (.getClass (Serdes/String)))
   StreamsConfig/TIMESTAMP_EXTRACTOR_CLASS_CONFIG (.getName GithubEventTimestampExtractor)})

(def input-topic
  (into-array String ["githubEvents"]))

(defn -main [& args]
  (prn "starting")
  (prn (.getName GithubEventTimestampExtractor))
  (prn props)
  (let [builder (KStreamBuilder.)
        config  (StreamsConfig. props)]
    (->
      (.stream builder input-topic)
      (.mapValues (reify ValueMapper (apply [_ v] ((comp str count) v))))
      (.to "my-output-topic"))

    (.start (KafkaStreams. builder config))
    (Thread/sleep (* 60000 10))
    (prn "stopping")))
