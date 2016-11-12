(ns topology.github-event-timestamp-extractor
  (:require [clojure.data.json :as json]
            [clj-time.coerce :as coerce])
  (:gen-class
    :name topology.github-event-timestamp-extractor.GithubEventTimestampExtractor
    :implements [org.apache.kafka.streams.processor.TimestampExtractor]
    :methods [[extract [org.apache.kafka.clients.consumer.ConsumerRecord long] long]]))

(defn -extract [_ record]
  (-> record
      (.value)
      (json/read-str)
      (get-in ["created_at"])
      (coerce/to-long)))
